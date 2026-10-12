import { Button, Input, Space, Typography } from "antd";
import type { HelpQuestion } from "../hooks/useHelpSettings";

export const MAX_HELP_QUESTIONS = 12;
const MAX_QUESTION_LENGTH = 200;

export function HelpQuestionsField(props: {
  value: HelpQuestion[]; disabled: boolean; zh: boolean; onChange: (questions: HelpQuestion[]) => void;
}) {
  const { value, disabled, zh, onChange } = props;
  const update = (index: number, language: "zh" | "en", text: string) =>
    onChange(value.map((question, position) => position === index ? { ...question, [language]: text } : question));
  return <div>
    <Typography.Paragraph>{zh ? "常用问题" : "Suggested questions"}</Typography.Paragraph>
    <Typography.Paragraph type="secondary">{zh
      ? "用户点击后立即提问。最多 12 条，每条最多 200 字；中文或英文至少填写一项。删除全部后不显示常用问题。"
      : "Clicking a question sends it immediately. Add up to 12 questions, with up to 200 characters per language. "
        + "Fill in at least one language. Remove all questions to hide suggestions."}</Typography.Paragraph>
    <Space direction="vertical" style={{ width: "100%" }}>
      {value.map((question, index) => <div key={index} style={{ display: "flex", gap: 8, alignItems: "start" }}>
        <Space direction="vertical" style={{ flex: 1, minWidth: 0 }}>
          <Input.TextArea aria-label={`${zh ? "中文问题" : "Chinese question"} ${index + 1}`}
            placeholder={zh ? "中文问题" : "Chinese question"} value={question.zh} disabled={disabled}
            maxLength={MAX_QUESTION_LENGTH} autoSize={{ minRows: 1, maxRows: 4 }}
            onChange={(event) => update(index, "zh", event.target.value)} />
          <Input.TextArea aria-label={`${zh ? "英文问题" : "English question"} ${index + 1}`}
            placeholder={zh ? "英文问题" : "English question"} value={question.en} disabled={disabled}
            maxLength={MAX_QUESTION_LENGTH} autoSize={{ minRows: 1, maxRows: 4 }}
            onChange={(event) => update(index, "en", event.target.value)} />
        </Space>
        <Button disabled={disabled} aria-label={`${zh ? "删除问题" : "Remove question"} ${index + 1}`}
          onClick={() => onChange(value.filter((_, position) => position !== index))}>{zh ? "删除" : "Remove"}</Button>
      </div>)}
      <Button disabled={disabled || value.length >= MAX_HELP_QUESTIONS}
        onClick={() => onChange([...value, { zh: "", en: "" }])}>{zh ? "新增问题" : "Add question"}</Button>
    </Space>
  </div>;
}
