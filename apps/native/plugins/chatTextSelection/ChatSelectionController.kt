package com.codexswitch.selection

import android.graphics.Rect
import android.text.Selection
import android.text.Spannable
import android.view.ActionMode
import android.view.MotionEvent
import android.view.Window
import android.widget.TextView

/** Observe outside taps without taking ownership of scrolling or native selection-handle gestures. */
internal class ChatSelectionController {
  private var view: TextView? = null
  private var mode: ActionMode? = null
  private var window: Window? = null
  private var original: Window.Callback? = null
  private var observer: Window.Callback? = null

  fun install(target: Window?) {
    if (target == null || target === window) return
    detach()
    val callback = target.callback ?: return
    val wrapper = object : Window.Callback by callback {
      override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) dismissOutside(event)
        return callback.dispatchTouchEvent(event)
      }
    }
    window = target
    original = callback
    observer = wrapper
    target.callback = wrapper
  }

  fun activate(target: TextView, actionMode: ActionMode) {
    view = target
    mode = actionMode
  }

  fun finished(actionMode: ActionMode) {
    if (mode !== actionMode) return
    view = null
    mode = null
  }

  private fun dismissOutside(event: MotionEvent) {
    val selected = view ?: return
    val bounds = Rect()
    if (selected.getGlobalVisibleRect(bounds) && bounds.contains(event.rawX.toInt(), event.rawY.toInt())) return
    val text = selected.text
    mode?.finish()
    if (text is Spannable) Selection.removeSelection(text)
  }

  fun detach() {
    mode?.finish()
    if (window?.callback === observer) window?.callback = original
    window = null
    original = null
    observer = null
    view = null
    mode = null
  }
}
