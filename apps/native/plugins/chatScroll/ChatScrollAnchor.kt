package com.codexswitch.scroll

import android.view.ViewGroup
import com.facebook.react.bridge.UIManager
import com.facebook.react.bridge.UIManagerListener
import com.facebook.react.common.annotations.UnstableReactNativeAPI
import com.facebook.react.views.scroll.ReactScrollView
import com.facebook.react.views.scroll.ReactScrollViewHelper
import com.facebook.react.views.scroll.ScrollEventType
import java.util.WeakHashMap

/** Apply bottom following in the same native layout pass, before changed messages can be drawn. */
@OptIn(UnstableReactNativeAPI::class)
class ChatScrollAnchor : ReactScrollViewHelper.ScrollListener,
  ReactScrollViewHelper.LayoutChangeListener, UIManagerListener {
  private data class Position(
    var following: Boolean,
    val edgeDistance: Float,
    var interacting: Boolean = false,
    var paused: Boolean = false,
  )
  private val positions = WeakHashMap<ReactScrollView, Position>()
  private var listening = false
  private val managers = mutableSetOf<UIManager>()

  fun attach(view: ReactScrollView, following: Boolean, edgeDistance: Float, manager: UIManager) {
    if (!listening) {
      ReactScrollViewHelper.addScrollListener(this)
      ReactScrollViewHelper.addLayoutChangeListener(this)
      listening = true
    }
    if (managers.add(manager)) manager.addUIManagerEventListener(this)
    positions[view] = Position(following, edgeDistance)
    follow(view)
  }

  fun setFollowing(view: ReactScrollView, following: Boolean) {
    val position = positions[view] ?: return
    position.following = following
    // A pagination request must remain paused through the drag that requested it.
    position.paused = !following
    if (following) position.interacting = false
    follow(view)
  }

  fun detach(view: ReactScrollView) {
    positions.remove(view)
  }

  fun finishLoadingOlder(view: ReactScrollView) {
    positions[view]?.paused = false
  }

  fun clear() {
    positions.clear()
    ReactScrollViewHelper.removeScrollListener(this)
    ReactScrollViewHelper.removeLayoutChangeListener(this)
    managers.forEach { it.removeUIManagerEventListener(this) }
    managers.clear()
    listening = false
  }

  private fun bottom(view: ReactScrollView): Int =
    maxOf(0, (view.getChildAt(0)?.height ?: 0) - view.height + view.paddingTop + view.paddingBottom)

  private fun follow(view: ViewGroup?) {
    if (view !is ReactScrollView || !view.isShown || view.height <= 0) return
    val position = positions[view] ?: return
    if (!position.following || position.interacting || view.getChildAt(0) == null) return
    val target = bottom(view)
    if (view.scrollY != target) view.scrollTo(view.scrollX, target)
  }

  override fun onLayout(scrollView: ViewGroup?) = follow(scrollView)
  override fun onLayoutChange(scrollView: ViewGroup) = follow(scrollView)

  // Fabric's visible-row preservation runs after individual layout events. Finish following after that batch.
  override fun didDispatchMountItems(uiManager: UIManager) {
    positions.keys.toList().forEach { follow(it) }
  }
  override fun willDispatchViewUpdates(uiManager: UIManager) = Unit
  override fun willMountItems(uiManager: UIManager) = Unit
  override fun didMountItems(uiManager: UIManager) = Unit
  override fun didScheduleMountItems(uiManager: UIManager) = Unit

  override fun onScroll(view: ViewGroup?, type: ScrollEventType?, xVelocity: Float, yVelocity: Float) {
    if (view !is ReactScrollView) return
    val position = positions[view] ?: return
    when (type) {
      ScrollEventType.BEGIN_DRAG -> {
        position.interacting = true
      }
      ScrollEventType.MOMENTUM_BEGIN -> position.interacting = true
      ScrollEventType.END_DRAG, ScrollEventType.MOMENTUM_END -> {
        if (!position.paused) position.following = bottom(view) - view.scrollY < position.edgeDistance
        position.interacting = false
      }
      ScrollEventType.SCROLL -> if (position.interacting && !position.paused) {
        position.following = bottom(view) - view.scrollY < position.edgeDistance
      }
      else -> Unit
    }
  }
}
