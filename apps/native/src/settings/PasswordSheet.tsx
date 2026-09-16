import { useState } from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import { changePassword } from '../api/client';
import { Toast } from '../components/AppToast';
import { BottomSheet } from '../components/BottomSheet';
import type { AuthSession } from '../types';
import { styles } from './styles';

export function PasswordSheet({ session, onClose }: { session: AuthSession; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (saving) return;
    if (currentPassword.length < 6) return setError('当前密码至少需要 6 位');
    if (newPassword.length < 8) return setError('新密码至少需要 8 位');
    if (newPassword !== confirmPassword) return setError('两次输入的新密码不一致');
    setSaving(true);
    setError('');
    try {
      await changePassword(session, currentPassword, newPassword);
      Toast.success('密码已修改，下次登录请使用新密码');
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : '修改失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };
  return <BottomSheet visible title="修改密码" subtitle="验证当前密码后设置新的登录密码"
    onClose={onClose} dismissible={!saving} tall actions={[
      { label: '取消', onPress: onClose, disabled: saving },
      { label: '确认修改', tone: 'primary', onPress: submit, loading: saving },
    ]}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
      <Text style={styles.detailLabel}>当前密码</Text>
      <TextInput accessibilityLabel="当前密码" value={currentPassword} onChangeText={setCurrentPassword}
        secureTextEntry autoComplete="current-password" placeholder="输入当前密码"
        style={styles.input} editable={!saving} />
      <Text style={styles.detailLabel}>新密码</Text>
      <TextInput accessibilityLabel="新密码" value={newPassword} onChangeText={setNewPassword}
        secureTextEntry autoComplete="new-password" placeholder="至少 8 位"
        style={styles.input} editable={!saving} />
      <Text style={styles.detailLabel}>确认新密码</Text>
      <TextInput accessibilityLabel="确认新密码" value={confirmPassword} onChangeText={setConfirmPassword}
        secureTextEntry autoComplete="new-password" placeholder="再次输入新密码"
        style={styles.input} editable={!saving} onSubmitEditing={() => void submit()} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScrollView>
  </BottomSheet>;
}
