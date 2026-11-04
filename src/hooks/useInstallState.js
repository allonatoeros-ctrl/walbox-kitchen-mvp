// WALRUS FOOD CLUB V1 — stato installazione/notifiche del dispositivo + invito da mostrare per un contesto.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { detectPlatform, platformLabel, resolveInstallInvite } from '../lib/installInvite';
import {
  ackPushDenied, dismissInstall, dismissPush, hasInstallPrompt, installedFlag, isStandalone, promptInstall,
  readInviteMemory, subscribePwa,
} from '../lib/pwaInstall';
import { isPushSupported } from '../lib/webPush';
import { foodClubApi } from '../lib/foodClubApi';

export function useInstallState({ context = 'tessera', member = false, pushStatus = 'idle' } = {}) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribePwa(() => setTick((t) => t + 1)), []);

  const platform = useMemo(() => detectPlatform({
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0,
  }), []);

  const invite = useMemo(() => {
    void tick;
    const mem = readInviteMemory();
    return resolveInstallInvite({
      platform,
      standalone: isStandalone(),
      bipAvailable: hasInstallPrompt(),
      installedFlag: installedFlag(),
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
      subscribed: pushStatus === 'subscribed',
      pushSupported: isPushSupported(),
      member,
      context,
      dismissedAt: mem.dismissedAt ?? null,
      dismissCount: mem.dismissCount ?? 0,
      pushDismissedAt: mem.pushDismissedAt ?? null,
      pushDismissCount: mem.pushDismissCount ?? 0,
      deniedAcked: !!mem.deniedAcked,
    });
  }, [platform, context, member, pushStatus, tick]);

  const label = platformLabel(platform);
  useEffect(() => {
    if (invite.kind !== 'none') foodClubApi.track('invite_shown', `${context}:${invite.kind}`.slice(0, 40), label);
  }, [invite.kind, context, label]);

  const install = useCallback(async () => {
    foodClubApi.track('install_cta_click', context, label);
    foodClubApi.track('install_prompt_shown', context, label);
    const outcome = await promptInstall();
    if (outcome === 'accepted') foodClubApi.track('install_accepted', context, label);
    if (outcome === 'dismissed') { foodClubApi.track('install_dismissed', context, label); dismissInstall(); }
    return outcome;
  }, [context, label]);

  return {
    platform,
    platformLabel: label,
    standalone: isStandalone(),
    invite,
    install,
    openGuide: () => foodClubApi.track('install_cta_click', context, label),
    dismissInstall,
    dismissPush,
    ackPushDenied,
  };
}
