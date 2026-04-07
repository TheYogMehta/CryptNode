import { useEffect, useState } from "react";
import {
  UserPlus,
  MessageSquare,
  Settings,
  Lock,
} from "lucide-react";
import {
  WelcomeContainer,
  WelcomeContent,
  WelcomeHero,
  IconWrapper,
  GreetingTitle,
  WelcomeMessage,
  ActionButtons,
  AddFriendButton,
  SecondaryActionButton,
  HighlightsSection,
  HighlightsHeader,
  HighlightsEyebrow,
  HighlightsHeading,
  HighlightsSubtext,
  HighlightsGrid,
  HighlightCard,
  HighlightTitle,
  HighlightText,
  StatsGrid,
  StatCard,
  StatValue,
  StatLabel,
} from "./Welcome.styles";

const getLocalHour = () => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    hour12: false,
    timeZone,
  }).formatToParts(new Date());

  const hourPart = parts.find((part) => part.type === "hour")?.value;
  const parsedHour = Number(hourPart);

  return Number.isFinite(parsedHour) ? parsedHour : new Date().getHours();
};

const getGreetingForHour = (hour: number) => {
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 22) return "Good Evening";
  return "Good Night";
};

export const WelcomeView = ({
  onAddFriend,
  onOpenSettings,
  onOpenVault,
  isMobile,
  sessionCount,
  onlineCount,
  unreadCount,
  linkedDeviceCount,
  onlineLinkedDeviceCount,
}: {
  onAddFriend: () => void;
  onOpenSettings: () => void;
  onOpenVault: () => void;
  isMobile: boolean;
  sessionCount: number;
  onlineCount: number;
  unreadCount: number;
  linkedDeviceCount: number;
  onlineLinkedDeviceCount: number;
}) => {
  const [greeting, setGreeting] = useState(() =>
    getGreetingForHour(getLocalHour()),
  );

  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getGreetingForHour(getLocalHour()));
    };

    updateGreeting();
    const intervalId = window.setInterval(updateGreeting, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <WelcomeContainer className="animate-fade-up">
      <WelcomeContent>
        <WelcomeHero>
          <IconWrapper className="animate-scale-in">
            <MessageSquare size={40} color="white" />
          </IconWrapper>

          <div>
            <GreetingTitle>{greeting}</GreetingTitle>
            <WelcomeMessage>
              Welcome to <span>CryptNode</span>. Secure, fast, and private messaging
              for everyone. Start a conversation, open your secure vault, or fine-tune the app from settings.
            </WelcomeMessage>
          </div>

          <StatsGrid>
            <StatCard>
              <StatValue>{sessionCount}</StatValue>
              <StatLabel>CONNECTIONS</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{onlineCount}</StatValue>
              <StatLabel>ONLINE NOW</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{unreadCount}</StatValue>
              <StatLabel>UNREAD ITEMS</StatLabel>
            </StatCard>
            {linkedDeviceCount > 1 && (
              <StatCard>
                <StatValue>{linkedDeviceCount}</StatValue>
                <StatLabel>OWN DEVICES LINKED</StatLabel>
              </StatCard>
            )}
            {onlineLinkedDeviceCount > 1 && (
              <StatCard>
                <StatValue>{onlineLinkedDeviceCount}</StatValue>
                <StatLabel>OWN DEVICES ONLINE</StatLabel>
              </StatCard>
            )}
          </StatsGrid>

          <ActionButtons>
            <AddFriendButton onClick={onAddFriend}>
              <UserPlus size={20} />
              <span>Add Friend</span>
            </AddFriendButton>

            <SecondaryActionButton onClick={onOpenVault}>
              <Lock size={18} />
              <span>Open Vault</span>
            </SecondaryActionButton>

            <SecondaryActionButton onClick={onOpenSettings}>
              <Settings size={18} />
              <span>Settings</span>
            </SecondaryActionButton>
          </ActionButtons>
        </WelcomeHero>

        <HighlightsSection>
          <HighlightsHeader>
            <HighlightsEyebrow>FEATURES</HighlightsEyebrow>
            <HighlightsHeading>What CryptNode gives you</HighlightsHeading>
            <HighlightsSubtext>
              Everything here is built around local-first privacy, encrypted storage, and a cleaner daily workflow.
            </HighlightsSubtext>
          </HighlightsHeader>

          <HighlightsGrid>
            <HighlightCard>
              <HighlightTitle>Secure Vault</HighlightTitle>
              <HighlightText>
                Keep passwords, notes, and sensitive files in one encrypted place that stays local-first.
              </HighlightText>
            </HighlightCard>
            {!isMobile && (
              <HighlightCard>
                <HighlightTitle>Local AI</HighlightTitle>
                <HighlightText>
                  Run AI features on-device for summaries, assistance, and private workflows without depending on cloud chat storage.
                </HighlightText>
              </HighlightCard>
            )}
            <HighlightCard>
              <HighlightTitle>Secure Chat</HighlightTitle>
              <HighlightText>
                Messages stay end-to-end encrypted, and chat data remains stored on your device for local-first privacy.
              </HighlightText>
            </HighlightCard>
          </HighlightsGrid>
        </HighlightsSection>
      </WelcomeContent>
    </WelcomeContainer>
  );
};
