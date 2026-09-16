package com.codexswitch.scroll

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.IllegalViewOperationException
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.views.scroll.ReactScrollView

class ChatScrollModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val anchor = ChatScrollAnchor()
  override fun getName() = "ChatScroll"

  @ReactMethod
  fun attach(tag: Int, following: Boolean, edgeDistance: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val view = scrollView(tag)
      val manager = UIManagerHelper.getUIManagerForReactTag(context, tag)
      if (view != null && manager != null) {
        anchor.attach(view, following, PixelUtil.toPixelFromDIP(edgeDistance), manager)
      }
      promise.resolve(view != null && manager != null)
    }
  }

  @ReactMethod
  fun setFollowing(tag: Int, following: Boolean) {
    UiThreadUtil.runOnUiThread { scrollView(tag)?.let { anchor.setFollowing(it, following) } }
  }

  @ReactMethod
  fun finishLoadingOlder(tag: Int) {
    UiThreadUtil.runOnUiThread { scrollView(tag)?.let { anchor.finishLoadingOlder(it) } }
  }

  @ReactMethod
  fun detach(tag: Int) {
    UiThreadUtil.runOnUiThread { scrollView(tag)?.let { anchor.detach(it) } }
  }

  override fun invalidate() {
    UiThreadUtil.runOnUiThread { anchor.clear() }
    super.invalidate()
  }

  private fun scrollView(tag: Int): ReactScrollView? = try {
    UIManagerHelper.getUIManagerForReactTag(context, tag)?.resolveView(tag) as? ReactScrollView
  } catch (_: IllegalViewOperationException) {
    // A conversation can unmount while its layout callback is crossing the bridge.
    null
  }
}
