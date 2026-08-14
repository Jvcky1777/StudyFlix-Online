// =======================================================================
// UI DOM MANAGER
// Strictly handles injecting, removing, and styling HTML elements.
// =======================================================================

// =======================================================================
// PHASE 1: DYNAMIC UI CARD GENERATOR
// =======================================================================
export function addRemoteUserCard(userId, userName, role) {
  const targetContainerId = role === 'instructor' ? 'main-stage-container' : 'participant-strip-container';
  const grid = document.getElementById(targetContainerId);
  
  if (!grid || document.getElementById(`remote-wrapper-${userId}`)) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'video-cell';
  wrapper.id = `remote-wrapper-${userId}`;
  wrapper.style.position = 'relative';
  
  wrapper.style.borderColor = role === 'instructor' ? 'var(--neon-purple)' : 'var(--neon-cyan)';
  wrapper.style.boxShadow = role === 'instructor' ? 'var(--glow-purple)' : 'var(--glow-cyan)';

  const initial = userName.charAt(0).toUpperCase();
  const placeholder = document.createElement('div');
  placeholder.id = `remote-placeholder-${userId}`;
  placeholder.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #1a1a1a; z-index: 2; border-radius: inherit;';
  
  placeholder.innerHTML = `
    <div class="avatar" style="width: 80px; height: 80px; font-size: 2.5rem; margin-bottom: 15px; background: var(--neon-cyan); display: flex; align-items: center; justify-content: center; border-radius: 50%; color: black;">${initial}</div>
    <h3 style="color: white; margin: 0; font-size: 1.2rem;">${userName} ${role === 'instructor' ? '(Host)' : ''}</h3>
    <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 5px;">Camera is off</p>
  `;

  const video = document.createElement('video');
  video.id = `remote-video-${userId}`;
  video.autoplay = true;
  video.playsInline = true;
  video.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';

  const nameplate = document.createElement('div');
  nameplate.className = 'video-nameplate';
  nameplate.textContent = userName;

  wrapper.appendChild(placeholder);
  wrapper.appendChild(video);
  wrapper.appendChild(nameplate);
  
  // Keep the local video at the very end of the strip
  const localWrapper = document.getElementById('local-video-wrapper');
  if (localWrapper && grid.contains(localWrapper)) {
    grid.insertBefore(wrapper, localWrapper);
  } else {
    grid.appendChild(wrapper);
  }

  return { videoElement: video, placeholderElement: placeholder };
}

export function removeRemoteUserCard(userId) {
  const wrapper = document.getElementById(`remote-wrapper-${userId}`);
  if (wrapper) wrapper.remove();
}

export function togglePlaceholder(userId, showVideo) {
  const placeholder = document.getElementById(`remote-placeholder-${userId}`);
  if (placeholder) {
    placeholder.style.display = showVideo ? 'none' : 'flex';
  }
}

// =======================================================================
// HAND RAISE UI MODIFIER
// =======================================================================
export function toggleHandRaiseUI(userId, isRaised) {
  // Check if we are targeting the local user or a remote peer
  const wrapperId = userId === 'local' ? 'local-video-wrapper' : `remote-wrapper-${userId}`;
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  let handIcon = document.getElementById(`hand-icon-${userId}`);

  if (isRaised) {
    if (!handIcon) {
      handIcon = document.createElement('div');
      handIcon.id = `hand-icon-${userId}`;
      handIcon.textContent = '✋';
      // Bouncing neon animation
      handIcon.style.cssText = 'position: absolute; top: 10px; right: 10px; z-index: 10; font-size: 2.5rem; filter: drop-shadow(0 0 10px var(--neon-cyan)); animation: pulseOpacity 1.5s infinite;';
      wrapper.appendChild(handIcon);
    }
  } else {
    if (handIcon) handIcon.remove();
  }
}

// =======================================================================
// ROSTER (PARTICIPANTS LIST) UI MANAGER
// =======================================================================
export function addOrUpdateRosterItem(peerId, peerData, currentUserId) {
  const rosterContainer = document.getElementById('roster-container');
  if (!rosterContainer) return;

  let listItem = document.getElementById(`roster-item-${peerId}`);
  
  // If they aren't in the list yet, create their row
  if (!listItem) {
    listItem = document.createElement('div');
    listItem.id = `roster-item-${peerId}`;
    listItem.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1a1a1a; margin-bottom: 8px; border-radius: 6px; border-left: 3px solid transparent;';
    rosterContainer.appendChild(listItem);
  }

  // Color code the edge based on their role
  const roleColor = peerData.role === 'instructor' ? 'var(--neon-purple)' : 'var(--neon-cyan)';
  listItem.style.borderLeftColor = roleColor;

  const nameTag = peerId === currentUserId ? `${peerData.name} (You)` : peerData.name;
  const hostTag = peerData.role === 'instructor' ? ' <span style="font-size: 0.7rem; background: var(--neon-purple); color: white; padding: 2px 5px; border-radius: 4px; margin-left: 5px;">Host</span>' : '';
  
  // Real-time status icons
  const micIcon = peerData.micOn ? '<span style="color: var(--neon-cyan); margin-left: 10px;" title="Mic On">🎤</span>' : '<span style="color: var(--text-muted); margin-left: 10px;" title="Mic Off">🔇</span>';
  const camIcon = peerData.cameraOn ? '<span style="color: var(--neon-cyan); margin-left: 5px;" title="Camera On">📷</span>' : '<span style="color: var(--text-muted); margin-left: 5px;" title="Camera Off">🚫</span>';
  const handIcon = peerData.handRaised ? '<span style="color: var(--neon-cyan); margin-left: 5px; animation: pulseOpacity 1.5s infinite;" title="Hand Raised">✋</span>' : '';

  // Inject the HTML
  listItem.innerHTML = `
    <div style="color: white; font-size: 0.95rem; font-weight: bold; display: flex; align-items: center;">
      ${nameTag} ${hostTag}
    </div>
    <div>
      ${handIcon}
      ${micIcon}
      ${camIcon}
    </div>
  `;
}

export function removeRosterItem(peerId) {
  const listItem = document.getElementById(`roster-item-${peerId}`);
  if (listItem) listItem.remove();
}