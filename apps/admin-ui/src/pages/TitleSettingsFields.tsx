import { Card, Form, Input, Select, Typography } from 'antd';
import { TITLE_MODEL_PATTERN, TITLE_REASONING_EFFORTS } from '../../../../shared/chat/titleSettings';

const EFFORT_LABELS = ['无', '极低', '低', '中', '高', '极高'];

export function TitleSettingsFields({ zh, loading }: { zh: boolean; loading: boolean }) {
  return <Card loading={loading} className="chat-policy-section">
    <div className="chat-policy-section-heading">
      <Typography.Title level={4}>{zh ? '对话自动起名' : 'Automatic conversation titles'}</Typography.Title>
      <Typography.Text type="secondary">{zh
        ? '为 Codex GUI 的新对话生成简短标题。用户每次打开 GUI 标签页时获取最新设置。'
        : 'Create short titles for new Codex GUI conversations. Settings refresh whenever the GUI tab opens.'}
      </Typography.Text>
    </div>
    <Form.Item name={['titleSettings', 'model']} label={zh ? '起名模型' : 'Title model'}
      rules={[{ required: true, pattern: TITLE_MODEL_PATTERN,
        message: zh ? '请输入有效的模型名称' : 'Enter a valid model name' }]}>
      <Input maxLength={128} placeholder="gpt-5.6-luna" />
    </Form.Item>
    <Form.Item name={['titleSettings', 'effort']} label={zh ? '推理强度' : 'Reasoning effort'}
      rules={[{ required: true }]}>
      <Select options={TITLE_REASONING_EFFORTS.map((value, index) => ({ value,
        label: zh ? EFFORT_LABELS[index] : value }))} />
    </Form.Item>
  </Card>;
}
