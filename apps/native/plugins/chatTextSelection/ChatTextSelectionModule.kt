package com.codexswitch.selection

import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.UIManagerHelper

/** Customize existing rich TextViews so selection handles, spans and links stay native. */
class ChatTextSelectionModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val controller = ChatSelectionController()
  override fun getName() = "ChatTextSelection"

  @ReactMethod
  fun configure(tag: Int, quoteEnabled: Boolean, trailingControls: Int) {
    UiThreadUtil.runOnUiThread {
      val view = textView(tag) ?: return@runOnUiThread
      view.isLongClickable = true
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        // Selection actions depend only on the chosen characters, so no asynchronous smart selection is needed.
        view.setTextClassifier(android.view.textclassifier.TextClassifier.NO_OP)
      }
      controller.install(currentActivity?.window)
      val actions = ChatSelectionActions(quoteEnabled, trailingControls) { text ->
        val event = Arguments.createMap().apply { putInt("tag", tag); putString("text", text) }
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("chatTextQuote", event)
      }
      view.customSelectionActionModeCallback = ChatSelectionMenu(view, controller, actions)
    }
  }

  override fun invalidate() {
    UiThreadUtil.runOnUiThread { controller.detach() }
    super.invalidate()
  }

  @ReactMethod
  fun detach(tag: Int) {
    UiThreadUtil.runOnUiThread {
      val view = textView(tag) ?: return@runOnUiThread
      if (view.customSelectionActionModeCallback is ChatSelectionMenu) view.customSelectionActionModeCallback = null
    }
  }

  private fun textView(tag: Int): TextView? = try {
    UIManagerHelper.getUIManagerForReactTag(context, tag)?.resolveView(tag) as? TextView
  } catch (_: com.facebook.react.uimanager.IllegalViewOperationException) {
    // Virtualized messages can unmount between a layout event and this UI-thread operation.
    null
  }
}
