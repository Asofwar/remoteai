package com.codexswitch.selection

import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.PixelUtil

/** OEM fonts can wrap differently in TextView than in Fabric's offscreen text measurement. */
internal fun reportChatTextOverflow(view: TextView) {
  val layout = view.layout ?: return
  if (!view.isTextSelectable || layout.lineCount == 0 || layout.lineCount > view.maxLines) return
  val height = layout.getLineBottom(layout.lineCount - 1) + view.compoundPaddingTop + view.compoundPaddingBottom
  if (height <= view.height) return
  val context = view.context as? ReactContext ?: return
  val event = Arguments.createMap().apply {
    putInt("tag", view.id)
    putDouble("width", PixelUtil.toDIPFromPixel(view.width.toFloat()).toDouble())
    putDouble("height", PixelUtil.toDIPFromPixel(height.toFloat()).toDouble())
  }
  context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
    .emit("chatTextOverflow", event)
}
