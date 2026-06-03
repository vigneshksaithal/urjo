<script lang="ts">
    import { onMount } from "svelte";
    import type { PresenceData } from "../../shared/social-types";

    type Props = {
        postId: string;
    };

    let { postId }: Props = $props();

    let activeCount = $state(0);

    const sendHeartbeat = async (): Promise<void> => {
        try {
            const res = await fetch("/api/presence/heartbeat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ postId }),
            });
            if (!res.ok) return;
            const data: PresenceData = await res.json();
            activeCount = data.activeCount;
        } catch {
            // Presence is informational only — errors silently ignored
        }
    };

    onMount(() => {
        sendHeartbeat();
        const interval = setInterval(sendHeartbeat, 15_000);
        return () => clearInterval(interval);
    });
</script>

<div
    class="flex items-center justify-center gap-1.5 px-3 py-1 text-xs text-theme-text-muted"
>
    <span>👥 {activeCount} here</span>
</div>
