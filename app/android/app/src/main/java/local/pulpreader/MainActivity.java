package local.pulpreader;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BancaDisplayPlugin.class); // local plugin: brightness + immersive (src/reader/display.ts)
        registerPlugin(BancaUpdatePlugin.class); // local plugin: new APKs from the PC on the LAN (src/updates/apk.ts)
        super.onCreate(savedInstanceState);
    }
}
