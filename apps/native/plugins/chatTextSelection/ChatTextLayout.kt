package com.codexswitch.selection

import android.os.Build
import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.PixelUtil

/** Keep TextView's wrap points consistent with React Native 0.79's advance-width measurement. */
internal fun configureChatTextLayout(view: TextView) {
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
    // Android 15 defaults to glyph bounds, but Fabric's StaticLayout still measures advance widths.
    // Mixing the two wraps short messages and repeatedly invalidates the overflow height correction.
    // https://github.com/facebook/react-native/issues/53286
    view.setUseBoundsForWidth(false)
  }
}

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
