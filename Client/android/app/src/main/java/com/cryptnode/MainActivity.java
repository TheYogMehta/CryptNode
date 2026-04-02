package com.cryptnode;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
    }

    /**
     * After the Capacitor Bridge is ready, install a custom WebViewClient that
     * intercepts ALL URL loads.  Any navigation to a non-local URL is handed off
     * to the system browser (Intent.ACTION_VIEW) instead of loading inside the
     * WebView.
     *
     * This is the Android equivalent of Electron's will-navigate guard and acts
     * as the definitive safety net even if the React layer fails to intercept a
     * link (e.g. links inside rendered DOCX content, deep redirects, etc.).
     */
    @Override
    public void onResume() {
        super.onResume();

        Bridge bridge = getBridge();
        if (bridge == null) return;

        WebView webView = bridge.getWebView();
        if (webView == null) return;

        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;

                String scheme = uri.getScheme();
                String host   = uri.getHost();

                // Allow local / app-internal URLs to load normally
                boolean isLocal =
                        "file".equals(scheme) ||
                        "data".equals(scheme) ||
                        "blob".equals(scheme) ||
                        ("http".equals(scheme)  && isLocalHost(host)) ||
                        ("https".equals(scheme) && isLocalHost(host)) ||
                        (host != null && host.contains("capacitor"));

                if (isLocal) {
                    // Let Capacitor / the app handle it
                    return super.shouldOverrideUrlLoading(view, request);
                }

                // External URL — open in the system browser
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getApplicationContext().startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }

                // Return true = we handled it, do NOT load in WebView
                return true;
            }

            private boolean isLocalHost(String host) {
                return host == null
                        || host.equals("localhost")
                        || host.equals("127.0.0.1")
                        || host.equals("::1")
                        || host.equals("[::1]");
            }
        });
    }
}