import React from "react";
import { Redirect, Route } from "react-router-dom";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";

/* Core CSS required for Ionic components to work properly */
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "@ionic/react/css/padding.css";
import "@ionic/react/css/float-elements.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/text-transformation.css";
import "@ionic/react/css/flex-utils.css";
import "@ionic/react/css/display.css";

import "./theme/global.css";
import { ThemeProvider } from "./theme/ThemeContext";

import Home from "./pages/Home/Home";
import { Login } from "./pages/Login";
import { SecureChatWindow } from "./pages/SecureChat/SecureChatWindow";

import ChatClient from "./services/core/ChatClient";

setupIonicReact();

const App: React.FC = () => {
  const handleLogin = async (token: string) => {
    try {
      await ChatClient.login(token);
      window.location.href = "/home";
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  return (
    <IonApp>
      <ThemeProvider>
        <IonReactRouter>
          <IonRouterOutlet>
            <Route exact path="/">
              <Redirect to="/home" />
            </Route>
            <Route exact path="/home">
              <Home />
            </Route>
            <Route exact path="/login">
              <Login onLogin={handleLogin} />
            </Route>
            <Route exact path="/secure-chat">
              <SecureChatWindow />
            </Route>
          </IonRouterOutlet>
        </IonReactRouter>
      </ThemeProvider>
    </IonApp>
  );
};

export default App;
