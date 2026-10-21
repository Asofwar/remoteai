import { afterEach, describe, expect, it } from 'vitest';
import { backendEnglish, backendRussian } from '../../../../shared/i18n/backend';
import {
  backendText,
  createBackendTranslator,
  translateBackendMessage,
  type BackendDictionaries,
} from '../../../../shared/i18n/backend/translateBackendMessage';
import { featureCopyEnglish, featureCopyRussian } from '../../../../shared/i18n/featureCopy';
import { setInterfaceLanguage } from '../../../../shared/i18n/interfaceLanguage';
import type { Language } from '../../../../shared/i18n/language';

const chinese = /[\u4e00-\u9fff]/;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

const englishTemplates: Record<string, string> = {
  '已导入 {count} 条会话': 'Imported {count} conversations',
  '生成 Agent Identity 认证信息失败：{error}': 'Failed to generate Agent Identity credentials: {error}',
  '实例 {name} 不可用': 'Instance {name} is unavailable',
  '迁移未完成：{stage}时，{reason}。': 'Migration incomplete while {stage}: {reason}.',
  // Declared before the more specific template on purpose: specificity wins over order.
  '{value1}失败：{value2}': '{value1} failed: {value2}',
  '下载文件失败：{value1}': 'Failed to download the file: {value1}',
  '{name} 与 {name} 相同': '{name} matches itself',
  '{value1}: {value2}': '{value1} — {value2}',
  '无法读取 (配置) 文件 {path}.bak? [只读] + {mode}': 'Cannot read (config) file {path}.bak? [read-only] + {mode}',
  '正则 ^$|\\*{value1}{} 结束': 'Regex ^$|\\*{value1}{} end',
  '第 {value1} 行（{value2}）：{value3}？': 'Line {value1} ({value2}): {value3}?',
  '已复制 {value1}{value2} 个文件': 'Copied [{value1}|{value2}] files',
};

const russianTemplates: Record<string, string> = {
  '已导入 {count} 条会话': 'Импортировано бесед: {count}',
  '生成 Agent Identity 认证信息失败：{error}': 'Не удалось создать учётные данные Agent Identity: {error}',
  '实例 {name} 不可用': 'Экземпляр «{name}» недоступен',
  '迁移未完成：{stage}时，{reason}。': 'Перенос не завершён во время {stage}: {reason}.',
};

const samples: BackendDictionaries = {
  en: {
    exact: {
      '登录失败': 'Sign-in failed',
      '默认实例': 'Default instance',
      '复制会话': 'copying conversations',
      '多行\n消息': 'Multi-line\nmessage',
      ...englishTemplates,
    },
    templates: englishTemplates,
  },
  ru: {
    exact: {
      '登录失败': 'Не удалось войти',
      '默认实例': 'Экземпляр по умолчанию',
      '复制会话': 'копирования бесед',
      ...russianTemplates,
    },
    templates: russianTemplates,
  },
};

const translate = createBackendTranslator(samples);
const en = (message: unknown) => translate('en', message);
const ru = (message: unknown) => translate('ru', message);

describe('createBackendTranslator', () => {
  it('returns Chinese and unknown messages unchanged', () => {
    expect(translate('zh', '登录失败')).toBe('登录失败');
    expect(translate('zh', '已导入 3 条会话')).toBe('已导入 3 条会话');
    expect(en('完全未知的消息')).toBe('完全未知的消息');
    expect(ru('Plain English text')).toBe('Plain English text');
    expect(en('')).toBe('');
  });

  it('converts any input to a string and never throws', () => {
    const throwing = { toString() { throw new Error('boom'); } };
    expect(en(42)).toBe('42');
    expect(en(null)).toBe('null');
    expect(en(undefined)).toBe('undefined');
    expect(translate('zh', 7)).toBe('7');
    expect(en(new Error('登录失败'))).toBe('Error: 登录失败');
    expect(en(Object.create(null))).toBe('[object Object]');
    expect(() => en(throwing)).not.toThrow();
    expect(typeof en(throwing)).toBe('string');
    expect(translate('de' as Language, '登录失败')).toBe('登录失败');
    expect(createBackendTranslator({ en: samples.en })('ru', '登录失败')).toBe('登录失败');
    const broken = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('boom'); } });
    expect(createBackendTranslator({ en: { exact: broken } })('en', '登录失败')).toBe('登录失败');
  });

  it('translates exact messages from the whole dictionary', () => {
    expect(en('登录失败')).toBe('Sign-in failed');
    expect(ru('登录失败')).toBe('Не удалось войти');
    expect(en('已导入 {count} 条会话')).toBe('Imported {count} conversations');
  });

  it('fills templates with captured values inserted verbatim', () => {
    expect(en('已导入 12 条会话')).toBe('Imported 12 conversations');
    expect(ru('已导入 12 条会话')).toBe('Импортировано бесед: 12');
    expect(en('生成 Agent Identity 认证信息失败：拒绝访问。 (os error 5) $& $1 {error}'))
      .toBe('Failed to generate Agent Identity credentials: 拒绝访问。 (os error 5) $& $1 {error}');
    expect(ru('生成 Agent Identity 认证信息失败：timeout'))
      .toBe('Не удалось создать учётные данные Agent Identity: timeout');
  });

  it('translates a captured value that is itself an exact key, one level only', () => {
    expect(en('实例 默认实例 不可用')).toBe('Instance Default instance is unavailable');
    expect(ru('实例 默认实例 不可用')).toBe('Экземпляр «Экземпляр по умолчанию» недоступен');
    expect(en('实例 已导入 3 条会话 不可用')).toBe('Instance 已导入 3 条会话 is unavailable');
  });

  it('captures lazily and prefers the most specific template', () => {
    expect(en('迁移未完成：复制会话时，读取 a时，b 失败。'))
      .toBe('Migration incomplete while copying conversations: 读取 a时，b 失败.');
    expect(ru('迁移未完成：复制会话时，磁盘已满。'))
      .toBe('Перенос не завершён во время копирования бесед: 磁盘已满.');
    expect(en('下载文件失败：超时')).toBe('Failed to download the file: 超时');
    expect(en('解压失败：超时')).toBe('解压 failed: 超时');
    expect(en('已复制 12 个文件')).toBe('Copied [|12] files');
  });

  it('escapes regular expression characters and full-width punctuation in sources', () => {
    expect(en('无法读取 (配置) 文件 C:\\data\\a.json.bak? [只读] + rw'))
      .toBe('Cannot read (config) file C:\\data\\a.json.bak? [read-only] + rw');
    expect(en('无法读取 X配置) 文件 a.bak? [只读] + rw')).toBe('无法读取 X配置) 文件 a.bak? [只读] + rw');
    expect(en('无法读取 (配置) 文件 a.ba [只读] + rw')).toBe('无法读取 (配置) 文件 a.ba [只读] + rw');
    expect(en('正则 ^$|\\*abc{} 结束')).toBe('Regex ^$|\\*abc{} end');
    expect(en('正则 ^$|\\*abc 结束')).toBe('正则 ^$|\\*abc 结束');
    expect(en('第 12 行（config.toml）：缺少字段？')).toBe('Line 12 (config.toml): 缺少字段?');
    expect(en('第 12 行(config.toml):缺少字段?')).toBe('第 12 行(config.toml):缺少字段?');
  });

  it('requires repeated placeholders to capture the same text', () => {
    expect(en('A 与 A 相同')).toBe('A matches itself');
    expect(en('A 与 B 相同')).toBe('A 与 B 相同');
  });

  it('ignores templates without Chinese literal text', () => {
    expect(en('甲: 乙')).toBe('甲: 乙');
  });

  it('translates multi-line messages line by line when the whole message has no match', () => {
    expect(en('登录失败\r\n未知的一行\n已导入 3 条会话\n\n  默认实例'))
      .toBe('Sign-in failed\r\n未知的一行\nImported 3 conversations\n\n  Default instance');
    expect(ru('登录失败\n已导入 3 条会话')).toBe('Не удалось войти\nИмпортировано бесед: 3');
    expect(en('多行\n消息')).toBe('Multi-line\nmessage');
    expect(en('生成 Agent Identity 认证信息失败：第一行\n登录失败'))
      .toBe('Failed to generate Agent Identity credentials: 第一行\n登录失败');
    expect(en('登录失败\n')).toBe('Sign-in failed\n');
    expect(en('未知一\n未知二')).toBe('未知一\n未知二');
  });

  it('leaves messages unchanged when the language has no matching entry', () => {
    expect(ru('下载文件失败：超时')).toBe('下载文件失败：超时');
    expect(ru('A 与 A 相同')).toBe('A 与 A 相同');
  });
});

describe('template compilation', () => {
  it('compiles 2000 templates once per language and stays fast', () => {
    const counts = { en: 0, ru: 0 };
    const counted = (language: 'en' | 'ru', target: Record<string, string>) => new Proxy(target, {
      ownKeys(object) {
        counts[language] += 1;
        return Reflect.ownKeys(object);
      },
    });
    const englishSource: Record<string, string> = {};
    const russianSource: Record<string, string> = {};
    for (let index = 0; index < 2000; index += 1) {
      englishSource[`模板 ${index} 号：{value1} 已完成（{value2}）`] = `Template ${index}: {value1} done ({value2})`;
      russianSource[`模板 ${index} 号：{value1} 已完成（{value2}）`] = `Шаблон ${index}: {value1} готово ({value2})`;
    }
    const englishTemplatesProxy = counted('en', englishSource);
    const russianTemplatesProxy = counted('ru', russianSource);
    const translator = createBackendTranslator({
      en: { exact: { '默认实例': 'Default instance' }, templates: englishTemplatesProxy },
      ru: { exact: {}, templates: russianTemplatesProxy },
    });

    const started = performance.now();
    for (let index = 0; index < 2000; index += 1) {
      expect(translator('en', `模板 ${index} 号：任务${index} 已完成（${index} s）`))
        .toBe(`Template ${index}: 任务${index} done (${index} s)`);
      expect(translator('en', `模板 ${index} 号：没有结尾`)).toBe(`模板 ${index} 号：没有结尾`);
    }
    expect(translator('en', '模板 7 号：默认实例 已完成（1）')).toBe('Template 7: Default instance done (1)');
    const elapsed = performance.now() - started;

    expect(counts).toEqual({ en: 1, ru: 0 });
    expect(translator('ru', '模板 1999 号：x 已完成（y）')).toBe('Шаблон 1999: x готово (y)');
    expect(translator('ru', '模板 5 号：x 已完成（y）')).toBe('Шаблон 5: x готово (y)');
    expect(counts).toEqual({ en: 1, ru: 1 });
    // Generous bound: other agents may load this machine; a per-call recompile takes minutes.
    expect(elapsed).toBeLessThan(10_000);
  });

  it('rejects long near-miss input without catastrophic backtracking', () => {
    const translator = createBackendTranslator({
      en: {
        exact: {},
        templates: {
          '{value1}：{value2}：{value3}！失败': '{value1}, {value2}, {value3}: failed',
          '{value1}：{value2}：{value3}失败': '{value1}; {value2}; {value3} failed',
          '{name} 与 {name} 相同': '{name} matches itself',
        },
      },
    });
    const started = performance.now();
    const nearMiss = `${'a：'.repeat(4000)}失败!`;
    expect(translator('en', nearMiss)).toBe(nearMiss);
    const repeated = `${'x 与 '.repeat(2000)}y 相同`;
    expect(translator('en', repeated)).toBe(repeated);
    expect(translator('en', `${'a：'.repeat(4000)}失败`)).toBe(`a; a; ${'a：'.repeat(3998)} failed`);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

describe('translateBackendMessage', () => {
  afterEach(() => setInterfaceLanguage('zh'));

  it('uses the shared dictionaries and the interface language', () => {
    expect(translateBackendMessage('zh', '取消')).toBe('取消');
    expect(translateBackendMessage('en', '取消')).toBe('Cancel');
    expect(translateBackendMessage('ru', '取消')).toBe('Отмена');
    expect(translateBackendMessage('ru', '未匹配的后端内容')).toBe('未匹配的后端内容');
    expect(translateBackendMessage('en', undefined)).toBe('undefined');
    setInterfaceLanguage('ru');
    expect(backendText('取消')).toBe('Отмена');
    expect(backendText('取消', 'en')).toBe('Cancel');
    setInterfaceLanguage('zh');
    expect(backendText('取消')).toBe('取消');
  });

  it('keeps backend dictionary placeholders and leaves no Chinese in translations', () => {
    for (const [source, value] of [...Object.entries(backendEnglish), ...Object.entries(backendRussian)]) {
      expect(placeholders(value), source).toEqual(placeholders(source));
      expect(value, source).not.toMatch(chinese);
    }
  });

  it('matches every shared template against a message of its own shape', () => {
    for (const [language, dictionary] of [['en', featureCopyEnglish], ['ru', featureCopyRussian]] as const) {
      for (const source of Object.keys(dictionary)) {
        const names = placeholders(source);
        if (!names.length || !chinese.test(source.replace(/\{\w+\}/g, ''))) continue;
        const sample = source.replace(/\{(\w+)\}/g, (_, name: string) => `X${names.indexOf(name)}`);
        const result = translateBackendMessage(language, sample);
        expect(typeof result, source).toBe('string');
        expect(result, `${language}: ${source}`).not.toBe(sample);
      }
    }
  });
});
