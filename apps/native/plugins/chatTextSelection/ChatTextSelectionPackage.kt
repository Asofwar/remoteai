package com.codexswitch.selection

import com.facebook.react.ReactPackage
import com.facebook.react.ViewManagerOnDemandReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ChatTextSelectionPackage : ReactPackage, ViewManagerOnDemandReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(ChatTextSelectionModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(ChatTextViewManager())

  override fun getViewManagerNames(reactContext: ReactApplicationContext): Collection<String> =
    listOf(com.facebook.react.views.text.ReactTextViewManager.REACT_CLASS)

  override fun createViewManager(
    reactContext: ReactApplicationContext,
    viewManagerName: String,
  ): ViewManager<*, *>? =
    if (viewManagerName == com.facebook.react.views.text.ReactTextViewManager.REACT_CLASS) ChatTextViewManager() else null
}
