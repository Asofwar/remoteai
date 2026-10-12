package dev.codexswitch.testing;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.UiAutomation;
import android.graphics.Rect;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import com.android.uiautomator.core.UiDevice;
import com.android.uiautomator.testrunner.UiAutomatorTestCase;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** Run against the separately installed TextSelectionFixture, with real touchscreen events. */
public final class TextSelectionGestureTest extends UiAutomatorTestCase {
    private UiAutomation automation;
    private static final String MESSAGE = "Long press this message";

    public void testTouchSelection() throws Exception {
        automation = automation();
        AccessibilityServiceInfo info = automation.getServiceInfo();
        info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        automation.setServiceInfo(info);
        assertNotNull("Selection fixture is open", awaitNode("文字选择验证"));
        tap("Blank space dismisses selection");
        Rect bounds = bounds(MESSAGE);
        int x = bounds.left + 160;
        int y = bounds.top + 30;
        for (int index = 0; index < 3; index++) {
            hold(x, y, 45);
            SystemClock.sleep(70);
        }
        assertUnselected("Quick repeated taps");
        hold(x, y, 250);
        assertUnselected("Short hold");
        checkCancelledSelection(x, y);
        checkSelectionDrag(x, y);
        hold(x, y, 750);
        assertNotNull("Long hold opens selection menu", awaitNode("引用"));
        AccessibilityNodeInfo selected = find(MESSAGE);
        assertTrue("Long hold selects characters", selected.getTextSelectionEnd() > selected.getTextSelectionStart());
        tap("全选");
        tap("引用");
        assertNotNull("Selected text can be quoted", awaitNode("Quotes: Long press this message"));
        hold(x, y, 750);
        assertNotNull("Selection can be opened again", awaitNode("复制"));
        tap("复制");
        assertUnselected("Copy closes selection");
        assertNoMagnifier("Copy");
        checkDrawerWithSelection(x, y);
        Rect link = bounds("Open inline link");
        hold(link.left + 80, link.centerY(), 45);
        assertNotNull("Inline link still handles a tap", awaitNode("Links opened: 1"));
        checkFormula();
        getUiDevice().swipe(x, y, x, y - 350, 35);
        SystemClock.sleep(250);
        assertUnselected("Scrolling does not select");
        Rect moved = bounds(MESSAGE);
        assertTrue("Message list scrolls", moved.top < bounds.top);
    }

    private void checkDrawerWithSelection(int x, int y) throws Exception {
        hold(x, y, 750);
        assertNotNull("Selection before opening drawer", awaitNode("引用"));
        getUiDevice().swipe(x, y, x + 350, y, 25);
        assertNotNull("Drawer opens", awaitNode("Conversation list"));
        assertNoMagnifier("Opening drawer");
        assertNull("Opening drawer closes selection menu", find("引用"));
        tap("Close conversation list");
        assertUnselected("Closing drawer does not restore selection");
        hold(x, y, 750);
        tap("Open conversation list");
        assertNotNull("Drawer button opens the list", awaitNode("Conversation list"));
        assertNull("Drawer button clears selection menu", find("引用"));
        tap("Close conversation list");
        assertUnselected("Drawer button clears selection");
    }

    private void checkCancelledSelection(int x, int y) throws Exception {
        long down = SystemClock.uptimeMillis();
        inject(MotionEvent.ACTION_DOWN, down, x, y);
        SystemClock.sleep(750);
        inject(MotionEvent.ACTION_MOVE, down, x + 6, y);
        SystemClock.sleep(250);
        assertTrue("Dragging selected text shows magnifier", awaitMagnifier(true));
        inject(MotionEvent.ACTION_CANCEL, down, x + 6, y);
        assertNoMagnifier("Cancelled selection");
        assertUnselected("Cancelled selection");
    }

    private void checkSelectionDrag(int x, int y) throws Exception {
        long down = SystemClock.uptimeMillis();
        inject(MotionEvent.ACTION_DOWN, down, x, y);
        SystemClock.sleep(750);
        for (int distance = 5; distance <= 120; distance += 5) {
            inject(MotionEvent.ACTION_MOVE, down, x + distance, y);
            SystemClock.sleep(20);
        }
        inject(MotionEvent.ACTION_UP, down, x + 120, y);
        assertNotNull("Selection drag keeps its menu", awaitNode("引用"));
        assertNull("Selection drag must not open the drawer", find("Conversation list"));
        assertNoMagnifier("Released selection drag");
        tap("Blank space dismisses selection");
    }

    private void assertNoMagnifier(String reason) throws Exception {
        assertTrue(reason + ": no magnifier surface", awaitMagnifier(false));
    }

    private boolean awaitMagnifier(boolean visible) throws Exception {
        for (int attempt = 0; attempt < 20; attempt++) {
            if (surfaces().contains("magnifier surface") == visible) return true;
            SystemClock.sleep(100);
        }
        return false;
    }

    private String surfaces() throws Exception {
        Process process = new ProcessBuilder("dumpsys", "SurfaceFlinger", "--list").redirectErrorStream(true).start();
        try (InputStream input = process.getInputStream();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            String result = output.toString("UTF-8").toLowerCase(java.util.Locale.ROOT);
            assertEquals("Surface listing is available: " + result, 0, process.waitFor());
            assertTrue("Surface listing is not empty", result.contains("selectiontest"));
            return result;
        }
    }

    private void checkFormula() throws Exception {
        Rect bounds = bounds("Formula selection");
        int x = bounds.left + 100;
        int y = bounds.centerY();
        hold(x, y, 45);
        hold(x, y, 45);
        assertNull("Formula quick taps do not select", find("Copy"));
        hold(x, y, 850);
        assertNotNull("Formula long press keeps the native menu", awaitNode("Copy"));
        tap("Copy");
    }

    private void hold(int x, int y, long duration) {
        long down = SystemClock.uptimeMillis();
        inject(MotionEvent.ACTION_DOWN, down, x, y);
        SystemClock.sleep(duration);
        inject(MotionEvent.ACTION_UP, down, x, y);
        SystemClock.sleep(30);
    }

    private void inject(int action, long down, int x, int y) {
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        assertTrue("Touch event is delivered", automation.injectInputEvent(event, true));
        event.recycle();
    }

    private void assertUnselected(String reason) {
        SystemClock.sleep(250);
        AccessibilityNodeInfo node = find(MESSAGE);
        assertNotNull(reason + ": message exists", node);
        assertTrue(reason + ": no selected range", node.getTextSelectionEnd() <= node.getTextSelectionStart());
        assertNull(reason + ": no toolbar", find("引用"));
    }

    private void tap(String label) throws Exception {
        Rect bounds = bounds(label);
        hold(bounds.centerX(), bounds.centerY(), 45);
        SystemClock.sleep(150);
    }

    private Rect bounds(String label) throws Exception {
        AccessibilityNodeInfo node = awaitNode(label);
        assertNotNull("Visible text: " + label, node);
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        return bounds;
    }

    private AccessibilityNodeInfo awaitNode(String label) {
        for (int attempt = 0; attempt < 30; attempt++) {
            AccessibilityNodeInfo node = find(label);
            if (node != null) return node;
            SystemClock.sleep(100);
        }
        return null;
    }

    private AccessibilityNodeInfo find(String label) {
        for (AccessibilityWindowInfo window : automation.getWindows()) {
            AccessibilityNodeInfo node = find(window.getRoot(), label);
            if (node != null) return node;
        }
        return null;
    }

    private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String label) {
        if (node == null) return null;
        if (node.isVisibleToUser() && String.valueOf(node.getText()).startsWith(label)) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = find(node.getChild(index), label);
            if (child != null) return child;
        }
        return null;
    }

    private UiAutomation automation() throws Exception {
        // The legacy shell runner exposes UiAutomation through its internal bridge only.
        Method method = UiDevice.class.getDeclaredMethod("getAutomatorBridge");
        method.setAccessible(true);
        Object bridge = method.invoke(getUiDevice());
        for (Class<?> type = bridge.getClass(); type != null; type = type.getSuperclass()) {
            for (Field field : type.getDeclaredFields()) {
                if (!UiAutomation.class.isAssignableFrom(field.getType())) continue;
                field.setAccessible(true);
                return (UiAutomation) field.get(bridge);
            }
        }
        throw new IllegalStateException("UiAutomation is unavailable");
    }
}
