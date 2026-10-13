import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Info, OctagonAlert, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { LedgerGate } from '../ledger/LedgerGate'
import { useAlerts } from '../ledger/useInsights'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextField, SelectField } from '../../components/ui/Field'
import { useToast } from '../../components/feedback/Toast'
import { taskFormSchema, taskFormToDoc, type TaskFormValues } from '../../domain/validation/phase3'
import type { Task } from '../../domain/types/ledger'
import { createTask, deleteTask, newId, setTaskDone, updateTask } from '../../lib/ledgerRepo'
import { formatDateEs } from '../../domain/calculations/dates'
import { humanizeFirebaseError } from '../../lib/errors'
import type { Severity } from '../../domain/calculations/alerts'

const SEV: Record<Severity, { label: string; Icon: typeof Info }> = {
  critical: { label: 'Urgente', Icon: OctagonAlert },
  warning: { label: 'Atención', Icon: AlertTriangle },
  info: { label: 'Aviso', Icon: Info },
}

function TaskForm({ task, onDone }: { task?: Task; onDone: () => void }) {
  const { user } = useAuth()
  const { businesses } = useLedger()
  const { notify } = useToast()
  const [id] = useState(() => task?.id ?? newId(user!.uid, 'tasks'))
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: { title: task?.title ?? '', dueDate: task?.dueDate ?? '', businessId: task?.businessId ?? '', notes: task?.notes ?? '' },
  })
  const onSubmit = handleSubmit(async (v) => {
    try {
      const d = taskFormToDoc(v, task?.done ?? false)
      if (task) await updateTask(user!.uid, task.id, d); else await createTask(user!.uid, id, d)
      notify('success', task ? 'Tarea actualizada.' : 'Tarea creada.'); onDone()
    } catch (e) { notify('error', humanizeFirebaseError(e)) }
  })
  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <TextField label="Tarea" placeholder="Ej.: Pagar impuestos del mes" error={errors.title?.message} {...register('title')} />
      <div className="grid-2">
        <TextField label="Fecha límite (opcional)" type="date" error={errors.dueDate?.message} {...register('dueDate')} />
        <SelectField label="Negocio (opcional)" error={errors.businessId?.message} {...register('businessId')}>
          <option value="">Personal / general</option>
          {businesses.filter((b) => b.status === 'active').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </SelectField>
      </div>
      <TextField label="Notas (opcional)" error={errors.notes?.message} {...register('notes')} />
      <div className="row modal-actions">
        <Button type="submit" loading={isSubmitting}>{task ? 'Guardar cambios' : 'Crear tarea'}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}

export function AlertsPage() {
  const { user } = useAuth()
  const { tasks, businesses, today } = useLedger()
  const { notify } = useToast()
  const alerts = useAlerts()
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const open = tasks.filter((t) => !t.done).sort((a, b) => (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1)
  const done = tasks.filter((t) => t.done)
  const bizName = (id: string | null) => businesses.find((b) => b.id === id)?.name

  async function toggle(t: Task) {
    try { await setTaskDone(user!.uid, t.id, t.title, !t.done) } catch (e) { notify('error', humanizeFirebaseError(e)) }
  }
  async function remove(t: Task) {
    try { await deleteTask(user!.uid, t.id, t.title); notify('success', 'Tarea eliminada.') } catch (e) { notify('error', humanizeFirebaseError(e)) }
  }

  return (
    <div className="page wide">
      <header className="page-head"><div><h1>Alertas y tareas</h1><p className="muted">Las alertas se calculan solas con tus datos y desaparecen cuando el problema se resuelve. Las tareas las manejas tú.</p></div></header>
      <LedgerGate>
        <section className="panel" aria-labelledby="alerts-title">
          <h2 id="alerts-title">Alertas ({alerts.length})</h2>
          {alerts.length === 0 ? <p className="muted">Todo en orden: no hay nada que requiera tu atención ahora.</p> : (
            <ul className="alerts">
              {alerts.map((a) => {
                const { label, Icon } = SEV[a.severity]
                return (
                  <li key={a.id} className={`alert alert-${a.severity}`}>
                    <Icon size={18} aria-hidden />
                    <div><strong>{a.title}</strong> <span className="sr-only">({label})</span><p className="small muted">{a.detail}</p></div>
                    {a.href ? <Link className="btn btn-secondary btn-sm" to={a.href}>Revisar</Link> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="tasks-title">
          <div className="row between"><h2 id="tasks-title">Tareas</h2><Button size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => setEditing('new')}>Nueva tarea</Button></div>
          {open.length === 0 ? <p className="muted">No tienes tareas pendientes.</p> : (
            <ul className="rows tasks">
              {open.map((t) => (
                <li key={t.id}>
                  <label className="check"><input type="checkbox" checked={false} onChange={() => toggle(t)} aria-label={`Completar: ${t.title}`} />
                    <span><strong>{t.title}</strong><span className="tiny muted block">{[t.dueDate ? `${t.dueDate < today ? 'Venció el ' : 'Para el '}${formatDateEs(t.dueDate)}` : null, bizName(t.businessId)].filter(Boolean).join(' · ')}</span></span>
                  </label>
                  <span />
                  <div className="actions">
                    <button type="button" className="icon-btn" aria-label={`Editar ${t.title}`} onClick={() => setEditing(t)}><Pencil size={16} aria-hidden /></button>
                    <button type="button" className="icon-btn" aria-label={`Eliminar ${t.title}`} onClick={() => remove(t)}><Trash2 size={16} aria-hidden /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {done.length ? (
            <details><summary className="muted small">Completadas ({done.length})</summary>
              <ul className="rows tasks">{done.map((t) => (
                <li key={t.id} className="is-void"><label className="check"><input type="checkbox" checked onChange={() => toggle(t)} aria-label={`Reabrir: ${t.title}`} /><span>{t.title}</span></label><span /><span /></li>
              ))}</ul>
            </details>
          ) : null}
        </section>
      </LedgerGate>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva tarea' : 'Editar tarea'}>
        {editing !== null ? <TaskForm task={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  )
}
