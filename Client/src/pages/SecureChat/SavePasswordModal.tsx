import React, { useState } from "react";
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol,
} from "@ionic/react";
import { diceOutline, closeOutline, checkmarkOutline } from "ionicons/icons";
import { generateRandomPassword } from "../../utils/crypto";

interface SavePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
}

const SavePasswordModal: React.FC<SavePasswordModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleGenerate = () => {
    setPassword(generateRandomPassword(16));
  };

  const handleSave = () => {
    if (!password || (!username && !email)) {
      // Basic validation
      alert("Please enter password and at least a username or email");
      return;
    }

    onSave({
      url,
      username,
      email,
      password,
    });
    reset();
  };

  const reset = () => {
    setUrl("");
    setUsername("");
    setEmail("");
    setPassword("");
    onClose();
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={reset}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Save Password</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={reset}>
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonItem>
          <IonLabel position="stacked">Website URL</IonLabel>
          <IonInput
            value={url}
            placeholder="https://example.com"
            onIonChange={(e) => setUrl(e.detail.value!)}
          />
        </IonItem>
        <IonItem>
          <IonLabel position="stacked">Username</IonLabel>
          <IonInput
            value={username}
            placeholder="Username"
            onIonChange={(e) => setUsername(e.detail.value!)}
          />
        </IonItem>
        <IonItem>
          <IonLabel position="stacked">Email</IonLabel>
          <IonInput
            value={email}
            type="email"
            placeholder="Email"
            onIonChange={(e) => setEmail(e.detail.value!)}
          />
        </IonItem>

        <IonGrid>
          <IonRow className="ion-align-items-center">
            <IonCol>
              <IonItem lines="none" className="ion-no-padding">
                <IonLabel position="stacked">Password</IonLabel>
                <IonInput
                  value={password}
                  type="text" // Show password here as user is editing/generating it
                  placeholder="Password"
                  onIonChange={(e) => setPassword(e.detail.value!)}
                />
              </IonItem>
            </IonCol>
            <IonCol size="auto">
              <IonButton
                onClick={handleGenerate}
                fill="clear"
                title="Generate Random Password"
              >
                <IonIcon icon={diceOutline} slot="icon-only" />
              </IonButton>
            </IonCol>
          </IonRow>
        </IonGrid>

        <div className="ion-padding-top">
          <IonButton expand="block" onClick={handleSave}>
            <IonIcon icon={checkmarkOutline} slot="start" />
            Save Credentials
          </IonButton>
        </div>
      </IonContent>
    </IonModal>
  );
};

export default SavePasswordModal;
