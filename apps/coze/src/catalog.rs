//! Local template library and portable dependency bundles. Installing never executes content.
use crate::{
    database::Database,
    error::{Error, Result},
    model::*,
    publications, resources,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

const FORMAT: &str = "remoteai-coze-template";
const MAX_ITEMS: usize = 128;
const BUILTIN_ID: &str = "builtin-knowledge-assistant";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemplateResource {
    id: String,
    kind: ResourceKind,
    name: String,
    description: String,
    draft: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    table_columns: Option<Vec<crate::tables::Column>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bundle {
    format: String,
    version: u32,
    name: String,
    description: String,
    entry_id: String,
    resources: Vec<TemplateResource>,
}

pub fn initialize(conn: &Connection) -> Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL
    );")?;
    Ok(())
}

pub fn export(db: &Database, id: &str) -> Result<Bundle> {
    let entry = resources::get(db, id)?;
    let mut pending = vec![id.to_owned()];
    let mut seen = BTreeSet::new();
    let mut items = Vec::new();
    while let Some(id) = pending.pop() {
        if !seen.insert(id.clone()) {
            continue;
        }
        if seen.len() > MAX_ITEMS {
            return Err(Error::Limit);
        }
        let resource = resources::get(db, &id)?;
        pending.extend(publications::references(&resource.draft)?);
        let table_columns = if resource.kind == ResourceKind::Table {
            Some(crate::tables::get_schema(db, &id)?.columns)
        } else {
            None
        };
        items.push(TemplateResource {
            id,
            kind: resource.kind,
            name: resource.name,
            description: resource.description,
            draft: resource.draft,
            table_columns,
        });
    }
    Ok(Bundle {
        format: FORMAT.into(),
        version: 1,
        name: entry.name,
        description: entry.description,
        entry_id: entry.id,
        resources: items,
    })
}

pub fn save(db: &Database, bundle: Bundle) -> Result<Value> {
    validate(&bundle)?;
    let id = uuid::Uuid::new_v4().to_string();
    db.connect()?.execute(
        "INSERT INTO templates VALUES (?1,?2,?3,?4,?5)",
        params![
            id,
            bundle.name,
            bundle.description,
            json!(bundle).to_string(),
            now()
        ],
    )?;
    Ok(json!({"id":id}))
}

pub fn list(db: &Database) -> Result<Value> {
    let conn = db.connect()?;
    let mut statement =
        conn.prepare("SELECT id,name,description FROM templates ORDER BY created_at DESC")?;
    let mut entries = builtin_entries();
    entries.extend(
        statement
            .query_map([], |row| {
                Ok(json!({"id":row.get::<_,String>(0)?,
        "name":row.get::<_,String>(1)?,"description":row.get::<_,String>(2)?,"builtin":false}))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    );
    Ok(json!(entries))
}

pub fn get(db: &Database, id: &str) -> Result<Bundle> {
    get_localized(db, id, None)
}

/// Reads a template. `language` (`zh`, `en` or `ru`) only selects the copy of the built-in
/// template; saved templates are user data and stay as saved. Unknown values mean Chinese.
pub fn get_localized(db: &Database, id: &str, language: Option<&str>) -> Result<Bundle> {
    if id == BUILTIN_ID {
        return builtin(language);
    }
    validate_id(id)?;
    let body: String = db
        .connect()?
        .query_row("SELECT body FROM templates WHERE id=?1", [id], |row| {
            row.get(0)
        })
        .optional()?
        .ok_or(Error::NotFound)?;
    serde_json::from_str(&body).map_err(|_| Error::Invalid)
}

pub fn install(db: &Database, id: &str) -> Result<Value> {
    install_localized(db, id, None)
}

/// Installs a template; `language` picks the built-in template's names, descriptions and
/// prompt as in [`get_localized`]. Installed resources are user data and never re-translated.
pub fn install_localized(db: &Database, id: &str, language: Option<&str>) -> Result<Value> {
    let mut bundle = get_localized(db, id, language)?;
    validate(&bundle)?;
    let mapping: BTreeMap<_, _> = bundle
        .resources
        .iter()
        .map(|resource| (resource.id.clone(), uuid::Uuid::new_v4().to_string()))
        .collect();
    let mut conn = db.connect()?;
    let tx = conn.transaction()?;
    for resource in &mut bundle.resources {
        remap(&mut resource.draft, &mapping);
        tx.execute(
            "INSERT INTO resources VALUES (?1,?2,?3,?4,?5,1,NULL,0,?6)",
            params![
                mapping[&resource.id],
                resource.kind.as_str(),
                resource.name,
                resource.description,
                resource.draft.to_string(),
                now()
            ],
        )?;
        if let Some(columns) = &resource.table_columns {
            tx.execute(
                "INSERT INTO table_schemas VALUES (?1,?2,1)",
                params![mapping[&resource.id], json!(columns).to_string()],
            )?;
        }
    }
    tx.commit()?;
    Ok(
        json!({"entryId":mapping[&bundle.entry_id],"resourceIds":mapping.values().collect::<Vec<_>>() }),
    )
}

pub fn delete(db: &Database, id: &str) -> Result<()> {
    validate_id(id)?;
    if db
        .connect()?
        .execute("DELETE FROM templates WHERE id=?1", [id])?
        != 1
    {
        return Err(Error::NotFound);
    }
    Ok(())
}

fn validate(bundle: &Bundle) -> Result<()> {
    if bundle.format != FORMAT
        || bundle.version != 1
        || bundle.name.trim().is_empty()
        || bundle.name.len() > 400
        || bundle.description.len() > 8000
        || bundle.resources.is_empty()
        || bundle.resources.len() > MAX_ITEMS
        || json!(bundle).to_string().len() > 4 * 1024 * 1024
    {
        return Err(Error::Invalid);
    }
    let ids: BTreeSet<_> = bundle
        .resources
        .iter()
        .map(|resource| resource.id.clone())
        .collect();
    if ids.len() != bundle.resources.len() || !ids.contains(&bundle.entry_id) {
        return Err(Error::Invalid);
    }
    for resource in &bundle.resources {
        validate_id(&resource.id)?;
        if let Some(columns) = &resource.table_columns {
            if resource.kind != ResourceKind::Table {
                return Err(Error::Invalid);
            }
            crate::tables::validate_columns(columns)?;
        }
        resources::validate(&ResourceInput {
            id: None,
            revision: None,
            kind: resource.kind,
            name: resource.name.clone(),
            description: resource.description.clone(),
            draft: resource.draft.clone(),
        })?;
        if !publications::references(&resource.draft)?.is_subset(&ids) {
            return Err(Error::Dependency);
        }
    }
    Ok(())
}

fn remap(value: &mut Value, mapping: &BTreeMap<String, String>) {
    let Some(values) = value.as_object_mut() else {
        return;
    };
    for (key, value) in values {
        match key.as_str() {
            "entryId" | "workflow_id" | "plugin_id" | "table_id" | "knowledge_id" => {
                replace(value, mapping)
            }
            "resourceIds" | "toolIds" | "writableTableIds" | "knowledgeIds" | "knowledge_ids"
            | "table_ids" => {
                if let Some(values) = value.as_array_mut() {
                    for value in values {
                        replace(value, mapping);
                    }
                }
            }
            "nodes" => {
                if let Some(values) = value.as_array_mut() {
                    for value in values {
                        remap(value, mapping);
                    }
                }
            }
            _ => {}
        }
    }
}

fn replace(value: &mut Value, mapping: &BTreeMap<String, String>) {
    if let Some(id) = value.as_str().and_then(|id| mapping.get(id)) {
        *value = json!(id);
    }
}

fn builtin_entries() -> Vec<Value> {
    vec![
        json!({"id":"builtin-knowledge-assistant","name":"知识问答助手",
        "description":"从资料库回答问题，附上可追溯的引用。选择模型并导入资料后即可使用。","builtin":true}),
    ]
}

/// Names, descriptions and the agent prompt of the built-in template in one language.
/// Installing copies them into the user's resources, so they are localized once, at install.
struct BuiltinCopy {
    name: &'static str,
    description: &'static str,
    knowledge_name: &'static str,
    knowledge_description: &'static str,
    agent_name: &'static str,
    agent_description: &'static str,
    agent_prompt: &'static str,
    app_name: &'static str,
    app_description: &'static str,
}

const BUILTIN_ZH: BuiltinCopy = BuiltinCopy {
    name: "知识问答助手",
    description: "回答资料中的问题，附上引用。",
    knowledge_name: "问答资料",
    knowledge_description: "导入助手需要参考的资料。",
    agent_name: "资料助手",
    agent_description: "从资料库回答问题。",
    agent_prompt: "根据资料回答问题并引用出处。没有依据时请说明。",
    app_name: "知识问答应用",
    app_description: "包含资料库和问答助手。",
};

const BUILTIN_EN: BuiltinCopy = BuiltinCopy {
    name: "Knowledge Q&A assistant",
    description: "Answers questions from your materials with citations.",
    knowledge_name: "Q&A materials",
    knowledge_description: "Import the materials the assistant should refer to.",
    agent_name: "Materials assistant",
    agent_description: "Answers questions from the knowledge base.",
    agent_prompt: "Answer questions based on the materials and cite your sources. \
        If the materials don't support an answer, say so.",
    app_name: "Knowledge Q&A app",
    app_description: "Includes the knowledge base and the Q&A assistant.",
};

const BUILTIN_RU: BuiltinCopy = BuiltinCopy {
    name: "Помощник по базе знаний",
    description: "Отвечает на вопросы по материалам и приводит ссылки на источники.",
    knowledge_name: "Материалы для ответов",
    knowledge_description: "Импортируйте материалы, на которые будет опираться помощник.",
    agent_name: "Помощник по материалам",
    agent_description: "Отвечает на вопросы по базе знаний.",
    agent_prompt: "Отвечайте на вопросы по материалам и указывайте источники. \
        Если в материалах нет ответа, сообщите об этом.",
    app_name: "Приложение для ответов по базе знаний",
    app_description: "Включает базу знаний и помощника для ответов на вопросы.",
};

/// `en` and `ru` select a translation; anything else, including no language, keeps Chinese.
fn builtin_copy(language: Option<&str>) -> &'static BuiltinCopy {
    match language {
        Some("en") => &BUILTIN_EN,
        Some("ru") => &BUILTIN_RU,
        _ => &BUILTIN_ZH,
    }
}

fn builtin(language: Option<&str>) -> Result<Bundle> {
    let copy = builtin_copy(language);
    serde_json::from_value(json!({"format":FORMAT,"version":1,"name":copy.name,
        "description":copy.description,"entryId":"00000000-0000-4000-8000-000000000003",
        "resources":[
            {"id":"00000000-0000-4000-8000-000000000001","kind":"knowledge","name":copy.knowledge_name,
                "description":copy.knowledge_description,"draft":{}},
            {"id":"00000000-0000-4000-8000-000000000002","kind":"agent","name":copy.agent_name,
                "description":copy.agent_description,"draft":{"model":"","prompt":copy.agent_prompt,
                    "knowledgeIds":["00000000-0000-4000-8000-000000000001"],"temperature":0.3}},
            {"id":"00000000-0000-4000-8000-000000000003","kind":"app","name":copy.app_name,
                "description":copy.app_description,"draft":{"entryId":"00000000-0000-4000-8000-000000000002",
                    "resourceIds":["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002"]}}
        ]})).map_err(|_| Error::Invalid)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn template_keeps_field_types_and_required_constraints() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let db = Database::open(temp.path())?;
        let table = resources::save(
            &db,
            ResourceInput {
                id: None,
                revision: None,
                kind: ResourceKind::Table,
                name: "字段测试".into(),
                description: String::new(),
                draft: json!({}),
            },
        )?;
        crate::tables::save_schema(
            &db,
            crate::tables::SchemaInput {
                table_id: table.id.clone(),
                revision: 0,
                columns: vec![crate::tables::Column {
                    name: "amount".into(),
                    kind: crate::tables::ColumnKind::Integer,
                    required: true,
                }],
            },
        )?;
        let template = save(&db, export(&db, &table.id)?)?;
        let installed = install(&db, template["id"].as_str().ok_or(Error::Invalid)?)?;
        let id = installed["entryId"].as_str().ok_or(Error::Invalid)?;
        assert!(crate::tables::write(&db, id, None, json!({})).is_err());
        assert!(crate::tables::write(&db, id, None, json!({"amount":"invalid"})).is_err());
        crate::tables::write(&db, id, None, json!({"amount":12}))?;
        Ok(())
    }
    #[test]
    fn template_install_copies_dependency_ids_without_overwriting_originals() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let db = Database::open(temp.path())?;
        let first = install(&db, "builtin-knowledge-assistant")?;
        let second = install(&db, "builtin-knowledge-assistant")?;
        assert_ne!(first["entryId"], second["entryId"]);
        assert_eq!(resources::list(&db)?.len(), 6);
        let bundle = export(&db, first["entryId"].as_str().ok_or(Error::Invalid)?)?;
        assert_eq!(bundle.resources.len(), 3);
        validate(&bundle)?;
        let imported = save(&db, bundle)?;
        install(&db, imported["id"].as_str().ok_or(Error::Invalid)?)?;
        assert_eq!(resources::list(&db)?.len(), 9);
        Ok(())
    }

    fn has_han(text: &str) -> bool {
        text.chars().any(|c| {
            matches!(c, '\u{3000}'..='\u{303f}' | '\u{3400}'..='\u{4dbf}'
                | '\u{4e00}'..='\u{9fff}' | '\u{ff00}'..='\u{ffef}')
        })
    }

    /// Drops the localized texts so only ids, kinds and drafts remain.
    fn without_copy(mut value: Value) -> Value {
        if let Some(object) = value.as_object_mut() {
            object.remove("name");
            object.remove("description");
            object.remove("prompt");
            for child in object.values_mut() {
                *child = without_copy(child.take());
            }
        } else if let Some(items) = value.as_array_mut() {
            for child in items {
                *child = without_copy(child.take());
            }
        }
        value
    }

    #[test]
    fn builtin_template_keeps_the_chinese_copy_without_a_known_language() -> Result<()> {
        let original: Bundle = serde_json::from_value(json!({"format":FORMAT,"version":1,"name":"知识问答助手",
            "description":"回答资料中的问题，附上引用。","entryId":"00000000-0000-4000-8000-000000000003",
            "resources":[
                {"id":"00000000-0000-4000-8000-000000000001","kind":"knowledge","name":"问答资料",
                    "description":"导入助手需要参考的资料。","draft":{}},
                {"id":"00000000-0000-4000-8000-000000000002","kind":"agent","name":"资料助手",
                    "description":"从资料库回答问题。","draft":{"model":"","prompt":"根据资料回答问题并引用出处。没有依据时请说明。",
                        "knowledgeIds":["00000000-0000-4000-8000-000000000001"],"temperature":0.3}},
                {"id":"00000000-0000-4000-8000-000000000003","kind":"app","name":"知识问答应用",
                    "description":"包含资料库和问答助手。","draft":{"entryId":"00000000-0000-4000-8000-000000000002",
                        "resourceIds":["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002"]}}
            ]}))
        .map_err(|_| Error::Invalid)?;
        let expected = json!(original).to_string();
        for language in [None, Some("zh"), Some(""), Some("RU"), Some("fr")] {
            assert_eq!(
                json!(builtin(language)?).to_string(),
                expected,
                "{language:?}"
            );
        }
        let temp = tempfile::tempdir()?;
        let db = Database::open(temp.path())?;
        assert_eq!(json!(get(&db, BUILTIN_ID)?).to_string(), expected);
        Ok(())
    }

    #[test]
    fn builtin_template_is_translated_for_english_and_russian() -> Result<()> {
        let chinese = without_copy(json!(builtin(None)?));
        for language in ["en", "ru"] {
            let bundle = builtin(Some(language))?;
            validate(&bundle)?;
            let text = json!(bundle).to_string();
            assert!(!has_han(&text), "{language}: {text}");
            assert_eq!(without_copy(json!(bundle)), chinese, "{language}");
            let copy = builtin_copy(Some(language));
            for field in [copy.agent_prompt, copy.description, copy.app_description] {
                assert!(
                    !field.contains(['\r', '\n']) && !field.contains("  "),
                    "{field:?}"
                );
            }
        }
        assert_ne!(
            json!(builtin(Some("en"))?).to_string(),
            json!(builtin(Some("ru"))?).to_string()
        );
        Ok(())
    }

    #[test]
    fn localized_install_stores_the_translated_copy() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let db = Database::open(temp.path())?;
        let installed = install_localized(&db, BUILTIN_ID, Some("ru"))?;
        let app = resources::get(&db, installed["entryId"].as_str().ok_or(Error::Invalid)?)?;
        assert_eq!(app.name, BUILTIN_RU.app_name);
        assert_eq!(app.description, BUILTIN_RU.app_description);
        let agent_id = app.draft["entryId"].as_str().ok_or(Error::Invalid)?;
        let agent = resources::get(&db, agent_id)?;
        assert_eq!(agent.name, BUILTIN_RU.agent_name);
        assert_eq!(agent.draft["prompt"], BUILTIN_RU.agent_prompt);
        let knowledge_id = agent.draft["knowledgeIds"][0]
            .as_str()
            .ok_or(Error::Invalid)?;
        assert_eq!(
            resources::get(&db, knowledge_id)?.name,
            BUILTIN_RU.knowledge_name
        );
        assert!(resources::list(&db)?
            .iter()
            .all(|resource| !has_han(&resource.name) && !has_han(&resource.description)));
        assert_eq!(
            get_localized(&db, BUILTIN_ID, Some("en"))?.name,
            BUILTIN_EN.name
        );
        Ok(())
    }
}
