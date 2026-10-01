package local.pulpreader;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BancaDisplayPlugin.class); // local plugin: brightness + immersive (src/reader/display.ts)
        super.onCreate(savedInstanceState);
    }
}
