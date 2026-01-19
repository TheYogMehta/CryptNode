package com.chatapp;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import org.torproject.android.binary.TorResourceInstaller;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Start Tor when the app opens
        startTor();
    }

    private void startTor() {
        new Thread(() -> {
            try {
                Log.i("TOR", "Installing Tor resources...");

                // 1. Install the binary to internal storage
                TorResourceInstaller installer = new TorResourceInstaller(this, getFilesDir());
                File fileTorBin = installer.installResources();

                if (fileTorBin != null && fileTorBin.exists()) {
                    // 2. Setup Data Directory
                    File appDataDir = new File(getFilesDir(), "tordata");
                    if (!appDataDir.exists()) appDataDir.mkdirs();

                    // 3. Command to run Tor
                    String[] torCmd = {
                            fileTorBin.getAbsolutePath(),
                            "DataDirectory", appDataDir.getAbsolutePath(),
                            "SocksPort", "127.0.0.1:9050",
                            "Log", "notice stdout",
                            "--runasdaemon", "0"
                    };

                    Log.i("TOR", "Starting Tor process...");
                    Process torProcess = Runtime.getRuntime().exec(torCmd);

                    // 4. Read Tor logs in real-time
                    BufferedReader reader = new BufferedReader(new InputStreamReader(torProcess.getInputStream()));
                    String line;
                    while ((line = reader.readLine()) != null) {
                        Log.d("TOR_LOG", line);
                        if (line.contains("Bootstrapped 100%")) {
                            Log.i("TOR", "CONNECTED: Tor is ready on 127.0.0.1:9050");
                        }
                    }
                }
            } catch (Exception e) {
                Log.e("TOR", "Error starting Tor", e);
            }
        }).start();
    }
}