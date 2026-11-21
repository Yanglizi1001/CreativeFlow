import React, { useEffect, useState } from 'react';

export function DesktopBehavior({ toast }) {
  const api = window.creativeFlowWindow;
  const [preferences, setPreferences] = useState(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!api?.getDesktopPreferences) return;
    let active = true;
    const off = api.onDesktopPreferencesChanged(value => { if (active) setPreferences(value); });
    api.getDesktopPreferences().then(value => { if (active) setPreferences(value); }).catch(() => toast('桌面设置读取失败，请重试', 'error'));
    return () => { active = false; off?.(); };
  }, []);
  const update = async (key, value) => {
    const previous = preferences;
    setPreferences({ ...preferences, [key]: value });
    setPending(true);
    try { setPreferences(await api.setDesktopPreferences({ [key]: value })); }
    catch { setPreferences(previous); toast('设置保存失败，请重试', 'error'); }
    finally { setPending(false); }
  };
  return <section className="settings-group"><h2>桌面行为</h2>
    {api?.getDesktopPreferences ? <>
      <div className="setting-row"><span><strong>点击关闭时隐藏到系统托盘</strong><small>关闭后在后台运行；关闭此开关时，退出应用。</small></span><label className="desktop-switch"><input role="switch" type="checkbox" aria-label="点击关闭时隐藏到系统托盘" checked={preferences?.closeToTray ?? true} disabled={!preferences || pending} onChange={event => update('closeToTray', event.target.checked)} /><span /></label></div>
      <div className="setting-row"><span><strong>关闭前询问</strong><small>{preferences?.askBeforeClose ? '当前关闭时仍会询问；关闭询问后，将直接执行上面的设置。' : '点击关闭时直接执行上面的设置，可随时重新开启询问。'}</small></span><label className="desktop-switch"><input role="switch" type="checkbox" aria-label="关闭前询问" checked={preferences?.askBeforeClose ?? true} disabled={!preferences || pending} onChange={event => update('askBeforeClose', event.target.checked)} /><span /></label></div>
      {['launchAtLogin','openManagerOnLaunch'].map(key=><div className="setting-row" key={key}><span><strong>{key==='launchAtLogin'?'登录 Windows 后启动创作流':'启动后自动打开协作管理窗口'}</strong><small>{key==='launchAtLogin'?'仅影响当前用户登录后的软件窗口；协作服务自启独立设置。':'默认关闭；主窗口、小组件和管理窗口仍可分别打开。'}</small></span><label className="desktop-switch"><input role="switch" type="checkbox" aria-label={key==='launchAtLogin'?'登录 Windows 后启动创作流':'启动后自动打开协作管理窗口'} checked={preferences?.[key]??false} disabled={!preferences||pending} onChange={event=>update(key,event.target.checked)}/><span/></label></div>)}
      <p className="desktop-behavior-note">最小化按钮将窗口收起到任务栏。双击托盘图标可恢复窗口；托盘菜单的“退出创作流”始终彻底退出。</p>
    </> : <p className="desktop-behavior-note">请在 Windows 桌面应用中设置关闭行为。</p>}
  </section>;
}
