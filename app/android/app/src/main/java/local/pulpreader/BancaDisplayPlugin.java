package local.pulpreader;

import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reader display controls (SPEC §4): in-app brightness that overrides the system brightness for this window only
 * (restored by passing null), and immersive full screen while reading.
 */
@CapacitorPlugin(name = "BancaDisplay")
public class BancaDisplayPlugin extends Plugin {

    /** { value: 0..1 } sets this window's brightness; { value: null } returns to the system brightness. */
    @PluginMethod
    public void setBrightness(PluginCall call) {
        final Double value = call.getData().isNull("value") ? null : call.getDouble("value");
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.screenBrightness = value == null
                ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                : (float) Math.max(0.02, Math.min(1.0, value));
            w.setAttributes(lp);
            call.resolve();
        });
    }

    /** { on: true } hides the status and navigation bars (swipe from an edge shows them temporarily). */
    @PluginMethod
    public void setImmersive(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            if (on) {
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                c.show(WindowInsetsCompat.Type.systemBars());
            }
            JSObject ret = new JSObject();
            ret.put("on", on);
            call.resolve(ret);
        });
    }
}
