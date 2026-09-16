import { useCallback } from "react";
import { Dialog, Toast } from "antd-mobile";
import { useAppDispatch, useAppSelector } from "../hooks";
import { restartDeviceCodex } from "../store";

export function useRemoteModelRestartPrompt() {
  const dispatch = useAppDispatch();
  const { devices, restartingDeviceId } = useAppSelector((state) => state.data);
  return useCallback(async (deviceId: string) => {
    const device = devices.find((candidate) => candidate.deviceId === deviceId);
    if (!device?.capabilities?.includes("restart-codex")) {
      await Dialog.alert({
        title: "重启以加载当前模型？",
        content: "已在官方模型与第三方 Provider 间切换。请在目标 PC 上手动重启 ChatGPT/Codex。",
        confirmText: "知道了",
      });
      return;
    }
    const confirmed = await Dialog.confirm({
      title: "重启以加载当前模型？",
      content: "已在官方模型与第三方 Provider 间切换。立即重启目标 PC 上的 ChatGPT/Codex 以加载当前模型。",
      confirmText: "立即重启",
      cancelText: "稍后",
    });
    if (!confirmed || restartingDeviceId) return;
    try {
      await dispatch(restartDeviceCodex(deviceId)).unwrap();
      Toast.show({ icon: "success", content: "目标 PC 上的 ChatGPT/Codex 已重启" });
    } catch { /* The global error toast reports the failure. */ }
  }, [devices, dispatch, restartingDeviceId]);
}
