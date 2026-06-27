import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── DB 함수들 ───

/** 의견 목록 조회 (삭제되지 않은 글만) */
export async function fetchOpinions() {
  const { data, error } = await supabase
    .from('opinions')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** 휴지통 조회 (삭제된 글만, 임원진 전용) */
export async function fetchDeletedOpinions() {
  const { data, error } = await supabase
    .from('opinions')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data
}

/** 의견 작성 */
export async function createOpinion(opinion) {
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
  const { error } = await supabase
    .from('opinions')
    .update({ likes: currentLikes + 1 })
    .eq('id', id)
  if (error) throw error
}

/** 상태 변경 (임원진) */
export async function updateStatus(id, status) {
  const { error } = await supabase
    .from('opinions')
    .update({ status })
    .eq('id', id)
  if (error) throw error
}

/** 답변 등록/수정 (임원진) */
export async function replyOpinion(id, reply) {
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

/** 답변 삭제 (임원진) - 답변만 지우고 상태를 확인됨으로 */
export async function removeReply(id) {
  const { error } = await supabase
    .from('opinions')
    .update({ reply: null, reply_date: null, status: 'read' })
    .eq('id', id)
  if (error) throw error
}

/** 의견 삭제 (임원진) - 휴지통으로 이동 (soft delete) */
export async function deleteOpinion(id) {
  const { error } = await supabase
    .from('opinions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** 의견 복구 (임원진) - 휴지통에서 복원 */
export async function restoreOpinion(id) {
  const { error } = await supabase
    .from('opinions')
    .update({ deleted_at: null })
    .eq('id', id)
  if (error) throw error
}

/** 의견 영구 삭제 (임원진) - 휴지통에서 완전 삭제 */
export async function permanentDeleteOpinion(id) {
  const { error } = await supabase
    .from('opinions')
    .delete()
    .eq('id', id)
  if (error) throw error
}
