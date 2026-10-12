package local.pulpreader;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * New APKs from the PC on the home network (Phase 12, tools/serve_updates.py, src/updates/apk.ts).
 * Native because the server is plain HTTP on a LAN address, which the https WebView may not fetch (mixed content).
 * The installer is Android's own: the user confirms every update, and grants "install unknown apps" to Banca once.
 */
@CapacitorPlugin(name = "BancaUpdate")
public class BancaUpdatePlugin extends Plugin {

    private static final String UA = "Banca/1.0 (personal reader app; LAN update check)";

    /** { url } → { text }: GET a small text file (the server's apk.json). */
    @PluginMethod
    public void getText(PluginCall call) {
        final String url = call.getString("url");
        new Thread(() -> {
            try {
                HttpURLConnection c = open(url, 4000);
                if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                try (InputStream in = c.getInputStream()) {
                    copy(in, out, null);
                }
                JSObject r = new JSObject();
                r.put("text", new String(out.toByteArray(), StandardCharsets.UTF_8));
                call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
            }
        }).start();
    }

    /** { url, sha256 }: download the APK to the cache, check it and open Android's installer. */
    @PluginMethod
    public void installApk(PluginCall call) {
        final String url = call.getString("url");
        final String sha = call.getString("sha256", "");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // one-time permission screen for this app; the user switches it on and taps Install again
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.reject("permission", "NEEDS_PERMISSION");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new Exception("cannot create " + dir);
                File apk = new File(dir, "banca.apk");
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                HttpURLConnection c = open(url, 15000);
                if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    copy(in, out, md);
                }
                StringBuilder hex = new StringBuilder();
                for (byte b : md.digest()) hex.append(String.format("%02x", b));
                if (!sha.isEmpty() && !sha.equalsIgnoreCase(hex.toString())) {
                    apk.delete();
                    throw new Exception("the APK checksum does not match");
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
            }
        }).start();
    }

    private static HttpURLConnection open(String url, int timeoutMs) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(timeoutMs);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", UA);
        return c;
    }

    private static void copy(InputStream in, OutputStream out, MessageDigest md) throws Exception {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (md != null) md.update(buf, 0, n);
        }
    }
}
