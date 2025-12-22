import React, { useState } from 'react';

const SecurityApp = () => {
  const [view, setView] = useState('chat'); // 'chat', 'addFriends', 'settings'
  const [activeSetting, setActiveSetting] = useState('profile');
  const [activeChat, setActiveChat] = useState('Secure Contact A'); // selected chat
  const [messages, setMessages] = useState({
    "Secure Contact A": [
      { id: 1, text: "Welcome to SecureChat!", sender: "system" }
    ],
    "Project Group": [
      { id: 1, text: "Welcome to Project Group!", sender: "system" }
    ]
  });
  const [input, setInput] = useState('');

  const chats = [
    { name: "Secure Contact A", avatar: "https://i.pravatar.cc/40?img=3" },
    { name: "Project Group", avatar: "https://i.pravatar.cc/40?img=5" },
  ];

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages({
      ...messages,
      [activeChat]: [...messages[activeChat], { id: Date.now(), text: input, sender: 'me' }]
    });
    setInput('');
  };

  const settingsData = {
    profile: {
      title: "Profile Settings",
      content: ["Change Avatar", "Update Username", "Encryption Key Management"]
    },
    decoy: {
      title: "Decoy Mode",
      content: ["Enable Duress Password", "Fake Chat History", "Auto-wipe on failure"]
    },
    proxy: {
      title: "Proxy Settings",
      content: ["SOCKS5 Configuration", "Tor Routing", "HTTP Proxy"]
    },
    customServer: {
      title: "Custom Server",
      content: ["Server URL: https://", "Port: 443", "TLS Certificate Pinning"]
    }
  };

  return (
    <div style={styles.container}>
      {/* EXTREME LEFT */}
      <div style={styles.sidebar}>
        <button onClick={() => setView('chat')} style={styles.btnStyle}>💬</button>
        <button onClick={() => setView('settings')} style={styles.btnStyle}>⚙️</button>
      </div>

      {/* MIDDLE & RIGHT */}
      <div style={styles.main}>
        {view === 'chat' && (
          <>
            {/* LEFT: CHAT LIST */}
            <div style={styles.chatList}>
              <div style={{ flex: 1, padding: '10px' }}>
                <h3>Recent Chats</h3>
                {chats.map(chat => (
                  <div
                    key={chat.name}
                    onClick={() => setActiveChat(chat.name)}
                    style={{
                      ...styles.chatThumbStyle,
                      backgroundColor: activeChat === chat.name ? '#333' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <img src={chat.avatar} alt="avatar" style={{ borderRadius: '50%', width: '40px', height: '40px' }} />
                    <span>{chat.name}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setView('addFriends')} style={styles.addFriendBtnStyle}>
                + Add Friends
              </button>
            </div>

            {/* RIGHT: CHAT INBOX */}
            <div style={styles.chatBox}>
              <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                {messages[activeChat].map(m => (
                  <div
                    key={m.id}
                    style={{ textAlign: m.sender === 'me' ? 'right' : 'left', margin: '10px 0' }}
                  >
                    <span style={{
                      background: m.sender === 'me' ? '#007bff' : '#333',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      display: 'inline-block',
                      maxWidth: '70%'
                    }}>
                      {m.text}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ padding: '20px', borderTop: '1px solid #333', display: 'flex' }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  style={styles.inputStyle}
                  placeholder="Type an encrypted message..."
                />
                <button onClick={sendMessage} style={styles.sendBtnStyle}>Send</button>
              </div>
            </div>
          </>
        )}

        {view === 'addFriends' && (
          <div style={styles.addFriendView}>
            <h2>Add Friends</h2>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '30px', flexWrap: 'wrap' }}>
              <div style={styles.cardStyle}>
                <h4>Invite via Code</h4>
                <input placeholder="Enter friend's code" style={styles.inputStyle} />
                <button style={styles.sendBtnStyle}>Add</button>
              </div>
              <div style={styles.cardStyle}>
                <h4>Your Invite Code</h4>
                <code style={{ display: 'block', margin: '15px 0', fontSize: '1.2rem' }}>
                  SECURE-99X-Z1
                </code>
                <button style={styles.sendBtnStyle}>Copy Code</button>
              </div>
            </div>
            <button
              onClick={() => setView('chat')}
              style={{ marginTop: '20px', background: 'none', color: 'gray', border: 'none', cursor: 'pointer' }}
            >
              Back to Chat
            </button>
          </div>
        )}

        {view === 'settings' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
            <div style={{ display: 'flex', flex: 1, flexDirection: 'row', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '200px', borderRight: '1px solid #333', padding: '20px' }}>
                <h3>Settings</h3>
                {Object.keys(settingsData).map(key => (
                  <div
                    key={key}
                    onClick={() => setActiveSetting(key)}
                    style={{ ...styles.chatThumbStyle, backgroundColor: activeSetting === key ? '#333' : 'transparent' }}
                  >
                    {settingsData[key].title}
                  </div>
                ))}
              </div>

              <div style={{ flex: 1, padding: '20px' }}>
                <h2>{settingsData[activeSetting].title}</h2>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {settingsData[activeSetting].content.map((item, i) => (
                    <li key={i} style={styles.settingItemStyle}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// STYLES
const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#1a1a1a', color: 'white', fontFamily: 'sans-serif', flexDirection: 'row' },
  sidebar: { width: '60px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' },
  btnStyle: { fontSize: '24px', background: 'none', border: 'none', color: 'white', cursor: 'pointer', marginBottom: '20px' },
  main: { flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' },
  chatList: { width: '300px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' },
  chatThumbStyle: { padding: '10px', borderBottom: '1px solid #222', cursor: 'pointer', borderRadius: '5px' },
  addFriendBtnStyle: { padding: '15px', backgroundColor: '#28a745', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' },
  chatBox: { flex: 1, display: 'flex', flexDirection: 'column' },
  inputStyle: { flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #444', backgroundColor: '#222', color: 'white' },
  sendBtnStyle: { marginLeft: '10px', padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' },
  cardStyle: { padding: '20px', border: '1px solid #444', borderRadius: '10px', width: '250px' },
  settingItemStyle: { padding: '15px 0', borderBottom: '1px solid #333', color: '#ccc' },
  addFriendView: { flex: 1, padding: '40px', textAlign: 'center', overflowY: 'auto' },
};

export default SecurityApp;
