import { useEffect, useState } from "react";
import { UserPlus, MessageSquare, Shield } from "lucide-react";
import {
  WelcomeContainer,
  WelcomeContent,
  IconWrapper,
  GreetingTitle,
  WelcomeMessage,
  ActionButtons,
  AddFriendButton,
  EncryptedBadge,
} from "./Welcome.styles";

export const WelcomeView = ({ onAddFriend }: { onAddFriend: () => void }) => {
  const [greeting, setGreeting] = useState("Good Morning");

  useEffect(() => {
    const hours = new Date().getHours();
    if (hours < 12) setGreeting("Good Morning");
    else if (hours < 18) setGreeting("Good Afternoon");
    else setGreeting("Good Evening");
  }, []);

  return (
    <WelcomeContainer className="animate-fade-up">
      <WelcomeContent>
        <IconWrapper className="animate-scale-in">
          <MessageSquare size={40} color="white" />
        </IconWrapper>

        <div>
          <GreetingTitle>{greeting}</GreetingTitle>
          <WelcomeMessage>
            Welcome to <span>CryptNode</span>. Secure, fast, and private messaging
            for everyone.
          </WelcomeMessage>
        </div>

        <ActionButtons>
          <AddFriendButton onClick={onAddFriend}>
            <UserPlus size={20} />
            <span>Add Friend</span>
          </AddFriendButton>

          <EncryptedBadge>
            <Shield size={18} />
            <span>End-to-End Encrypted</span>
          </EncryptedBadge>
        </ActionButtons>
      </WelcomeContent>
    </WelcomeContainer>
  );
};
