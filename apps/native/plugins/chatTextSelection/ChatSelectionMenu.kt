package com.codexswitch.selection

import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.widget.TextView
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.text.Selection
import android.text.Spannable
import android.graphics.Rect

private const val QUOTE_ACTION = 0x435351
private const val TOOLBAR_ANCHOR_OFFSET_DP = 4

internal data class ChatSelectionActions(
  val quoteEnabled: Boolean,
  val trailingControls: Int,
  val quote: (String) -> Unit,
)

internal class ChatSelectionMenu(
  private val view: TextView,
  private val controller: ChatSelectionController,
  private val actions: ChatSelectionActions,
) : ActionMode.Callback {
  override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
    controller.activate(view, mode)
    return populate(menu)
  }
  override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean = populate(menu)

  private fun populate(menu: Menu): Boolean {
    menu.clear()
    menu.add(Menu.NONE, android.R.id.copy, 0, "复制").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
    menu.add(Menu.NONE, android.R.id.selectAll, 1, "全选").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
    if (actions.quoteEnabled) menu.add(Menu.NONE, QUOTE_ACTION, 2, "引用")
      .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
    return true
  }

  override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
    if (item.itemId == android.R.id.selectAll && actions.trailingControls > 0) {
      val text = view.text as? Spannable ?: return view.onTextContextMenuItem(item.itemId)
      Selection.setSelection(text, 0, contentEnd())
      mode.invalidate()
      return true
    }
    if (item.itemId != QUOTE_ACTION && (item.itemId != android.R.id.copy || actions.trailingControls == 0)) {
      return view.onTextContextMenuItem(item.itemId)
    }
    val start = minOf(view.selectionStart, view.selectionEnd)
    val end = minOf(maxOf(view.selectionStart, view.selectionEnd), contentEnd())
    if (start >= 0 && end > start) {
      val selected = view.text.subSequence(start, end).toString()
      mode.finish()
      if (item.itemId == QUOTE_ACTION) actions.quote(selected)
      else (view.context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)
        ?.setPrimaryClip(ClipData.newPlainText("", selected))
    }
    return true
  }

  override fun onDestroyActionMode(mode: ActionMode) {
    controller.finished(mode)
  }

  fun anchorContentRect(outRect: Rect) {
    val layout = view.layout ?: return
    val start = minOf(view.selectionStart, view.selectionEnd).coerceIn(0, contentEnd())
    val first = layout.getLineForOffset(start)
    // Keep Android's horizontal bounds and lower handle clearance. The top must remain inside the text view;
    // an anchor below a single-line view makes Android hide the toolbar as offscreen.
    val offset = (TOOLBAR_ANCHOR_OFFSET_DP * view.resources.displayMetrics.density).toInt()
    val top = layout.getLineBaseline(first) + view.totalPaddingTop - view.scrollY - offset
    outRect.top = minOf(top, outRect.bottom - 1)
  }

  // React Native represents each trailing inline button with one layout placeholder character.
  // Keep those controls out of both selected quotes and the clipboard without altering source text.
  private fun contentEnd(): Int = (view.text.length - actions.trailingControls.coerceAtLeast(0)).coerceAtLeast(0)
}
