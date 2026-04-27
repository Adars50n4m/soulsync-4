type GroupCreateBody = {
  id: string;
  name: string;
  creator_id: string;
  avatar_url?: string | null;
  member_ids?: string[];
};

type GroupUpdateBody = {
  name?: string;
  description?: string;
  avatar_url?: string | null;
};

type SupabaseError = {
  message?: string;
  error?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

async function supabaseFetch(env: Env, path: string, init: RequestInit = {}) {
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path.replace(/^\//, '')}`;
  const headers = new Headers(init.headers);
  headers.set('apikey', env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set('Authorization', `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  headers.set('Content-Type', 'application/json');
  return fetch(url, { ...init, headers });
}

async function readSupabaseError(response: Response): Promise<SupabaseError> {
  try {
    return await response.json<SupabaseError>();
  } catch {
    return { message: await response.text() };
  }
}

async function createGroup(env: Env, body: GroupCreateBody) {
  if (!body.id || !body.name || !body.creator_id) {
    return json({ error: 'Missing required group fields.' }, 400);
  }

  const groupInsert = await supabaseFetch(env, 'chat_groups', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: body.id,
      name: body.name,
      creator_id: body.creator_id,
      avatar_url: body.avatar_url ?? null,
    }),
  });

  if (!groupInsert.ok) {
    return json({ error: await readSupabaseError(groupInsert) }, groupInsert.status);
  }

  const memberIds = Array.from(new Set([body.creator_id, ...(body.member_ids ?? [])]));
  if (memberIds.length > 0) {
    const membersInsert = await supabaseFetch(env, 'chat_group_members', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(
        memberIds.map((userId) => ({
          group_id: body.id,
          user_id: userId,
          role: userId === body.creator_id ? 'admin' : 'member',
          joined_at: new Date().toISOString(),
        }))
      ),
    });

    if (!membersInsert.ok) {
      return json({ error: await readSupabaseError(membersInsert) }, membersInsert.status);
    }
  }

  return json({ id: body.id }, 200);
}

async function updateGroup(env: Env, groupId: string, body: GroupUpdateBody) {
  if (!groupId) {
    return json({ error: 'Missing group id.' }, 400);
  }

  const patch: Record<string, string | null> = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.description === 'string') patch.description = body.description;
  if ('avatar_url' in body) patch.avatar_url = body.avatar_url ?? null;

  if (Object.keys(patch).length === 0) {
    return json({ error: 'No update fields provided.' }, 400);
  }

  const response = await supabaseFetch(
    env,
    `chat_groups?id=eq.${encodeURIComponent(groupId)}`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    }
  );

  if (!response.ok) {
    return json({ error: await readSupabaseError(response) }, response.status);
  }

  const rows = await response.json<any[]>();
  return json(rows?.[0] ?? { id: groupId, ...patch }, 200);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/groups/create') {
      const body = await request.json<GroupCreateBody>();
      return createGroup(env, body);
    }

    if (request.method === 'PATCH' && url.pathname.startsWith('/api/groups/')) {
      const groupId = url.pathname.split('/').pop() || '';
      const body = await request.json<GroupUpdateBody>();
      return updateGroup(env, groupId, body);
    }

    return json({ ok: true, service: 'cloudflare-proxy' }, 200);
  },
} satisfies ExportedHandler<Env>;
