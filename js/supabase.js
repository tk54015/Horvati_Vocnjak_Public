// Supabase: prijava i baza. Publishable ključ je javan po dizajnu (podatke štite pravila u bazi).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

export const SUPABASE_URL = 'https://vhcvegrnmpheqsgxybhj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_GBKoZq_izqZqvjQrEu1NLg_osocRQUa';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ---------------------------------------------------------------------------
// Voćnjaci
// ---------------------------------------------------------------------------
const COLS = 'id, name, address, boundary, area, center, created_by, created_at, updated_at, orchard_members(role, user_id)';

function withRole(row, userId) {
  const me = (row.orchard_members || []).find((m) => m.user_id === userId);
  const o = Object.assign({}, row, { role: me ? me.role : (row.created_by === userId ? 'owner' : 'viewer') });
  delete o.orchard_members;
  return o;
}

export const db = {
  async list(userId) {
    const { data, error } = await supabase.from('orchards').select(COLS).order('name');
    if (error) throw error;
    return (data || []).map((r) => withRole(r, userId));
  },
  async create(orchard, userId) {
    const { data, error } = await supabase.from('orchards')
      .insert({ name: orchard.name, address: orchard.address || null, boundary: orchard.boundary || null, area: orchard.area || 0, center: orchard.center || null })
      .select('id, name, address, boundary, area, center, created_by, created_at, updated_at')
      .single();
    if (error) throw error;
    return Object.assign(data, { role: 'owner', created_by: data.created_by || userId });
  },
  async update(orchard) {
    const { error } = await supabase.from('orchards')
      .update({ name: orchard.name, address: orchard.address || null, boundary: orchard.boundary, area: orchard.area, center: orchard.center })
      .eq('id', orchard.id);
    if (error) throw error;
  },
  async remove(id) {
    const { error } = await supabase.from('orchards').delete().eq('id', id);
    if (error) throw error;
  }
};

// ---------------------------------------------------------------------------
// Stabla
// ---------------------------------------------------------------------------
const TREE_COLS = 'id, orchard_id, species, name, lat, lng, height_m, stage, canopy, notes, data, created_at, updated_at';

export const treesDb = {
  async list(orchardId) {
    const { data, error } = await supabase.from('trees').select(TREE_COLS).eq('orchard_id', orchardId).order('created_at');
    if (error) throw error;
    return data || [];
  },
  async create(tree) {
    const { data, error } = await supabase.from('trees').insert(tree).select(TREE_COLS).single();
    if (error) throw error;
    return data;
  },
  async update(id, patch) {
    const { error } = await supabase.from('trees').update(patch).eq('id', id);
    if (error) throw error;
  },
  async remove(id) {
    const { error } = await supabase.from('trees').delete().eq('id', id);
    if (error) throw error;
  }
};
