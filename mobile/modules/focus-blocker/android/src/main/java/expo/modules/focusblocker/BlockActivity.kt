package expo.modules.focusblocker

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedDispatcher

/** Écran affiché à la place d'une application bloquée. Interface construite en code : aucune ressource à fusionner. */
class BlockActivity : Activity() {
  companion object {
    const val EXTRA_PACKAGE = "package"
    private const val BG = 0xFF0E1014.toInt()
    private const val SURFACE = 0xFF1C2028.toInt()
    private const val TEXT = 0xFFECEBE7.toInt()
    private const val MUTED = 0xFFA0A5B0.toInt()
    private const val ACCENT = 0xFFE2B66B.toInt()
    private const val ON_ACCENT = 0xFF1B1408.toInt()
  }

  private val handler = Handler(Looper.getMainLooper())
  private lateinit var remaining: TextView
  private lateinit var appLine: TextView
  private val tick = object : Runnable {
    override fun run() {
      val store = FocusStore(this@BlockActivity)
      val left = store.endAt - System.currentTimeMillis()
      if (left <= 0) {
        finish()
        return
      }
      remaining.text = formatRemaining(left)
      handler.postDelayed(this, 1000)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.statusBarColor = BG
    window.navigationBarColor = BG
    setContentView(buildView())
    showBlockedApp(intent)
    if (Build.VERSION.SDK_INT >= 33) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goHome() }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    showBlockedApp(intent)
  }

  override fun onResume() {
    super.onResume()
    handler.post(tick)
  }

  override fun onPause() {
    super.onPause()
    handler.removeCallbacks(tick)
  }

  @Deprecated("Remplacé par OnBackInvokedCallback à partir d'Android 13")
  override fun onBackPressed() = goHome()

  private fun goHome() {
    startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    finish()
  }

  private fun openFocusApp() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED))
    }
    finish()
  }

  private fun showBlockedApp(intent: Intent?) {
    val pkg = intent?.getStringExtra(EXTRA_PACKAGE).orEmpty()
    val label = try {
      packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) {
      pkg
    }
    val name = label.ifEmpty { "Cette application" }
    appLine.text = if (FocusStore(this).mode == FocusStore.MODE_ALLOW) {
      "$name ne fait pas partie de tes applications autorisées pendant la session."
    } else {
      "$name est bloquée jusqu'à la fin de la session."
    }
  }

  private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

  private fun text(value: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
    text = value
    setTextColor(color)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
    gravity = Gravity.CENTER
    if (bold) typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
  }

  private fun button(label: String, primary: Boolean, onClick: () -> Unit) = Button(this).apply {
    text = label
    isAllCaps = false
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    setTextColor(if (primary) ON_ACCENT else TEXT)
    background = GradientDrawable().apply {
      cornerRadius = dp(14f).toFloat()
      setColor(if (primary) ACCENT else SURFACE)
    }
    stateListAnimator = null
    setOnClickListener { onClick() }
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54f)).apply { topMargin = dp(12f) }
  }

  private fun buildView(): View {
    val store = FocusStore(this)
    remaining = text("", 56f, TEXT, bold = true).apply { setPadding(0, dp(8f), 0, dp(4f)) }
    appLine = text("", 15f, MUTED).apply { setPadding(0, dp(18f), 0, dp(8f)) }
    return LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(BG)
      setPadding(dp(28f), dp(28f), dp(28f), dp(28f))
      addView(text("◎", 44f, ACCENT))
      addView(text("Reste concentré", 26f, TEXT, bold = true).apply { setPadding(0, dp(12f), 0, 0) })
      if (store.intention.isNotBlank()) {
        addView(text("« ${store.intention} »", 17f, ACCENT).apply { setPadding(0, dp(10f), 0, 0) })
      }
      addView(remaining)
      addView(text("restantes", 13f, MUTED))
      addView(appLine)
      addView(button("Retour à l'accueil", primary = true) { goHome() })
      addView(button("Ouvrir OpusFocus", primary = false) { openFocusApp() })
    }
  }

  private fun formatRemaining(ms: Long): String {
    val s = (ms + 999) / 1000
    val h = s / 3600
    val m = (s % 3600) / 60
    val r = s % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, r) else "%02d:%02d".format(m, r)
  }
}
