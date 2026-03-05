import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  isConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  initError: null,
}

let client = null

try {
  if (!supabaseConfig.isConfigured) {
    throw new Error('Supabase 환경변수가 비어 있습니다.')
  }
  client = createClient(supabaseUrl, supabaseAnonKey)
} catch (e) {
  supabaseConfig.initError = e
  console.error('❌ Supabase 초기화 실패:', e?.message || e)
}

export const supabase = client

// ─── DB 함수들 ───

/** 의견 목록 조회 */
export async function fetchOpinions() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('opinions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** 의견 작성 */
export async function createOpinion(opinion) {
  if (!supabase) throw new Error('Supabase가 아직 설정되지 않았습니다.')
  const { data, error } = await supabase
    .from('opinions')
    .insert([{
      category: opinion.category,
      title: opinion.title,
      content: opinion.content,
      author: opinion.author,
      anonymous: opinion.anonymous,
      secret: opinion.secret,
      priority: opinion.priority,
    }])
    .select()
    .single()
  if (error) throw error
  return data
}

/** 좋아요 +1 */
export async function likeOpinion(id, currentLikes) {
  if (!supabase) throw new Error('Supabase가 아직 설정되지 않았습니다.')
  const { error } = await supabase
    .from('opinions')
    .update({ likes: currentLikes + 1 })
    .eq('id', id)
  if (error) throw error
}

/** 상태 변경 (임원진) */
export async function updateStatus(id, status) {
  if (!supabase) throw new Error('Supabase가 아직 설정되지 않았습니다.')
  const { error } = await supabase
    .from('opinions')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}

/** 답변 등록 (임원진) */
export async function replyOpinion(id, reply) {
  if (!supabase) throw new Error('Supabase가 아직 설정되지 않았습니다.')
  const { error } = await supabase
    .from('opinions')
    .update({
      reply,
      reply_date: new Date().toISOString().split('T')[0],
      status: 'replied',
    })
    .eq('id', id)
  if (error) throw error
}

/** 의견 삭제 (임원진) */
export async function deleteOpinion(id) {
  if (!supabase) throw new Error('Supabase가 아직 설정되지 않았습니다.')
  const { error } = await supabase
    .from('opinions')
    .delete()
    .eq('id', id)
  if (error) throw error
}
