package expo.modules.focusblocker

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telecom.TelecomManager
import android.view.accessibility.AccessibilityEvent
import android.view.inputmethod.InputMethodManager

/**
 * Surveille l'application au premier plan. Pendant une session, si elle n'est pas permise,
 * on revient à l'écran d'accueil et on affiche l'écran « Reste concentré ».
 */
class FocusBlockerService : AccessibilityService() {
  private var lastPkg = ""
  private var lastBlockAt = 0L
  private var launchable: Set<String> = emptySet()
  private var essentials: Set<String> = emptySet()
  private var cachedAt = 0L

  override fun onServiceConnected() {
    super.onServiceConnected()
    // Le service est relié par le système au démarrage : Android l'autorise alors à ouvrir l'application.
    Session.openAtBootOnce(this)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    if (pkg == packageName) return

    val store = FocusStore(this)
    if (!store.isActive() || !isBlocked(store, pkg)) return

    // Une même ouverture produit souvent plusieurs événements : on ne compte qu'une tentative.
    val now = System.currentTimeMillis()
    if (pkg != lastPkg || now - lastBlockAt > 2000) store.recordBlock(pkg)
    lastPkg = pkg
    lastBlockAt = now

    // L'action « accueil » est traitée de façon asynchrone par le système : lancé tout de suite, l'écran
    // « Reste concentré » se retrouvait recouvert par l'écran d'accueil. On l'affiche donc juste après.
    performGlobalAction(GLOBAL_ACTION_HOME)
    handler.removeCallbacksAndMessages(null)
    handler.postDelayed({
      startActivity(
        Intent(this, BlockActivity::class.java)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
          .putExtra(BlockActivity.EXTRA_PACKAGE, pkg)
      )
    }, 350)
  }

  private val handler = Handler(Looper.getMainLooper())

  private fun isBlocked(store: FocusStore, pkg: String): Boolean {
    if (!store.blockApps) return false
    if (store.mode != FocusStore.MODE_ALLOW) return pkg in store.packages
    refreshCaches()
    // Liste blanche : seules les vraies applications (icône dans le lanceur) sont concernées, jamais
    // les fenêtres système, et les applications essentielles restent toujours accessibles.
    return pkg in launchable && pkg !in essentials && pkg !in store.packages
  }

  private fun refreshCaches() {
    val now = System.currentTimeMillis()
    if (now - cachedAt < 60_000) return
    cachedAt = now
    launchable = launchablePackages(this)
    essentials = essentialPackages(this)
  }

  override fun onInterrupt() = Unit
}

/** Applications visibles dans le lanceur. */
internal fun launchablePackages(context: Context): Set<String> {
  val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
  return context.packageManager.queryIntentActivities(launcher, 0).map { it.activityInfo.packageName }.toSet()
}

/**
 * Toujours permises en mode liste blanche, pour ne jamais rester bloqué : écran d'accueil, téléphone
 * (appels et urgences), clavier, réglages, et l'application elle-même.
 */
internal fun essentialPackages(context: Context): Set<String> {
  val pm = context.packageManager
  val out = mutableSetOf(context.packageName, "com.android.settings", "com.android.emergency", "com.google.android.dialer",
    "com.android.dialer", "com.samsung.android.dialer", "com.android.phone", "com.android.systemui")
  val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
  pm.queryIntentActivities(home, 0).forEach { out += it.activityInfo.packageName }
  try {
    (context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage?.let { out += it }
  } catch (e: SecurityException) {
    // Sans importance : les composeurs connus sont déjà dans la liste.
  }
  (context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
    ?.enabledInputMethodList?.forEach { out += it.packageName }
  Settings.Secure.getString(context.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
    ?.substringBefore('/')?.let { out += it }
  return out
}
