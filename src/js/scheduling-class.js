
export function injectScheduleModal() {
  // Check if it already exists so we don't inject duplicates
  if (document.getElementById('schedule-modal')) return;

  const modalHTML = `
    <div id="schedule-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center; backdrop-filter: blur(5px);">
      <div style="background: var(--bg-surface); padding: 30px; border-radius: 12px; border: 1px solid var(--neon-cyan); box-shadow: var(--glow-cyan); max-width: 400px; width: 90%; text-align: left;">
        <h3 class="glow-text" style="margin-bottom: 15px; font-size: 1.3rem;">Schedule a Class</h3>
        
        <form id="schedule-form">
          <input type="text" id="sched-title" placeholder="Class Title (e.g., Java Basics)" required>
          <input type="text" id="sched-module" placeholder="Module Name (e.g., Computer Science 101)" required>
          
          <label style="color: var(--text-muted); font-size: 0.85rem; margin-top: 10px; display: block; margin-left: 10px;">Select Date & Time:</label>
          <input type="datetime-local" id="sched-time" required style="color: var(--text-main); color-scheme: dark;">
          
          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button type="button" id="modal-sched-cancel" class="secondary" style="margin-top: 0;">Cancel</button>
            <button type="submit" id="modal-sched-btn" style="margin-top: 0;">Schedule</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Inject the HTML directly into the body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}
