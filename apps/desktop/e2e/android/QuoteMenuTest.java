package dev.codexswitch.testing;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.UiAutomation;
import android.graphics.Rect;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import com.android.uiautomator.core.UiDevice;
import com.android.uiautomator.testrunner.UiAutomatorTestCase;
import java.lang.reflect.Method;
import java.lang.reflect.Field;
import java.util.LinkedHashMap;
import java.util.Map;

/** Floating text-selection toolbars live outside the active application's accessibility root. */
public final class QuoteMenuTest extends UiAutomatorTestCase {
    public void testAction() throws Exception {
        UiAutomation automation = automation();
        AccessibilityServiceInfo info = automation.getServiceInfo();
        info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        automation.setServiceInfo(info);
        Map<String, Rect> controls = new LinkedHashMap<>();
        boolean absent = "true".equals(getParams().getString("absent"));
        for (int attempt = 0; attempt < 20; attempt++) {
            controls.clear();
            for (AccessibilityWindowInfo window : automation.getWindows()) collect(window.getRoot(), controls);
            if (absent ? controls.isEmpty() : controls.size() == 3) break;
            Thread.sleep(100);
        }
        if (absent) { assertTrue("Selection toolbar is dismissed", controls.isEmpty()); return; }
        assertTrue("Copy is available", controls.containsKey("复制"));
        assertTrue("Select all is available", controls.containsKey("全选"));
        assertTrue("Quote is available", controls.containsKey("引用"));
        String action = getParams().getString("action");
        if (action == null) return;
        Rect bounds = controls.get(action);
        assertNotNull("Requested selection action exists", bounds);
        assertTrue(getUiDevice().click(bounds.centerX(), bounds.centerY()));
    }

    private void collect(AccessibilityNodeInfo node, Map<String, Rect> controls) {
        if (node == null) return;
        String text = String.valueOf(node.getText());
        if (node.isVisibleToUser() && ("复制".equals(text) || "全选".equals(text) || "引用".equals(text))) {
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            if (!bounds.isEmpty()) controls.put(text, bounds);
        }
        for (int index = 0; index < node.getChildCount(); index++) collect(node.getChild(index), controls);
    }

    private UiAutomation automation() throws Exception {
        // The deprecated shell runner only exposes its UiAutomation through the internal bridge.
        Method getBridge = UiDevice.class.getDeclaredMethod("getAutomatorBridge");
        getBridge.setAccessible(true);
        Object bridge = getBridge.invoke(getUiDevice());
        Class<?> type = bridge.getClass();
        while (type != null) {
            for (Field field : type.getDeclaredFields()) {
                if (!UiAutomation.class.isAssignableFrom(field.getType())) continue;
                field.setAccessible(true);
                return (UiAutomation) field.get(bridge);
            }
            type = type.getSuperclass();
        }
        throw new IllegalStateException("UiAutomation is unavailable");
    }
}
