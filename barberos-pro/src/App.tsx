import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays,
  Check, ChevronRight, CircleDollarSign, ClipboardCheck, Download, LayoutDashboard, LogOut,
  Package, Plus, Receipt, Search, Settings, Scissors, Users, Wallet, X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { hasBackendConfig, supabase } from './lib/supabase';
import { createExcelWorkbook, type ReportSheet } from './lib/excel';

type Shop = { id: string; name: string; currency: string; phone: string; address: string };
type Product = { id: string; shop_id: string; name: string; category: string; sku: string; stock: number; min_stock: number; sale_price: number; unit_cost: number };
type Service = { id: string; shop_id: string; name: string; price: number; duration_minutes: number };
type Client = { id: string; shop_id: string; name: string; phone: string; notes: string; created_at: string };
type Sale = { id: string; shop_id: string; client_id: string | null; barber_id: string; payment_method: string; total: number; created_at: string; detail?: string; sale_items?: { item_name: string; quantity: number; service_id: string | null; product_id: string | null }[] };
type Expense = { id: string; concept: string; category: string; amount: number; note: string; created_at: string };
type Closing = { id: string; business_day: string; sale_count: number; sales_total: number; expenses_total: number; net_total: number; closed_at: string };
type InventoryMove = { id: string; product_id: string; kind: 'sale'|'restock'|'adjustment'; quantity: number; note: string; created_at: string };
type Page = 'home' | 'sales' | 'inventory' | 'expenses' | 'clients' | 'reports' | 'settings';
type ModalKind = 'sale' | 'product' | 'expense' | 'client' | null;
type DemoSale = Sale & { client_name: string; detail: string };

const nav = [
  { id: 'home', label: 'Resumen', icon: LayoutDashboard }, { id: 'sales', label: 'Caja y cortes', icon: Scissors },
  { id: 'inventory', label: 'Inventario', icon: Package }, { id: 'expenses', label: 'Gastos', icon: Receipt },
  { id: 'clients', label: 'Clientes', icon: Users }, { id: 'reports', label: 'Reportes', icon: BarChart3 },
  { id: 'settings', label: 'Ajustes', icon: Settings },
] as const;
const dateKey = (value: string | Date) => { const d=new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const today = () => dateKey(new Date());
const readableDate = (date: string) => new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const cash = (value: number, currency = 'MXN') => new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value) || 0);
const demoClients: Client[] = [
  { id: 'c1', shop_id: 'demo', name: 'Diego Ramírez', phone: '55 2184 9061', notes: '', created_at: new Date().toISOString() },
  { id: 'c2', shop_id: 'demo', name: 'Mateo Cruz', phone: '55 3902 4418', notes: '', created_at: new Date().toISOString() },
  { id: 'c3', shop_id: 'demo', name: 'Andrés Soto', phone: '55 7831 2056', notes: '', created_at: new Date().toISOString() },
  { id: 'c4', shop_id: 'demo', name: 'Carlos Méndez', phone: '55 2840 6317', notes: '', created_at: new Date().toISOString() },
];
function demoSeed() {
  const day = (n: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hour, 20, 0, 0); return d.toISOString(); };
  const sales: DemoSale[] = [
    { id: 's1', shop_id: 'demo', client_id: 'c1', barber_id: 'Alex', payment_method: 'Efectivo', total: 180, created_at: day(0, 10), client_name: 'Diego Ramírez', detail: 'Corte clásico' },
    { id: 's2', shop_id: 'demo', client_id: 'c2', barber_id: 'Luis', payment_method: 'Tarjeta', total: 280, created_at: day(0, 11), client_name: 'Mateo Cruz', detail: 'Corte + barba' },
    { id: 's3', shop_id: 'demo', client_id: 'c3', barber_id: 'Alex', payment_method: 'Efectivo', total: 200, created_at: day(1, 13), client_name: 'Andrés Soto', detail: 'Fade' },
    { id: 's4', shop_id: 'demo', client_id: 'c4', barber_id: 'Luis', payment_method: 'Efectivo', total: 120, created_at: day(2, 12), client_name: 'Carlos Méndez', detail: 'Pomada mate × 1' },
    { id: 's5', shop_id: 'demo', client_id: 'c1', barber_id: 'Alex', payment_method: 'Tarjeta', total: 280, created_at: day(3, 15), client_name: 'Diego Ramírez', detail: 'Corte + barba' },
    { id: 's6', shop_id: 'demo', client_id: 'c2', barber_id: 'Luis', payment_method: 'Efectivo', total: 180, created_at: day(4, 10), client_name: 'Mateo Cruz', detail: 'Corte clásico' },
    { id: 's7', shop_id: 'demo', client_id: 'c3', barber_id: 'Alex', payment_method: 'Transferencia', total: 140, created_at: day(5, 14), client_name: 'Andrés Soto', detail: 'Arreglo de barba' },
    { id: 's8', shop_id: 'demo', client_id: 'c4', barber_id: 'Luis', payment_method: 'Efectivo', total: 200, created_at: day(6, 11), client_name: 'Carlos Méndez', detail: 'Fade' },
  ];
  const products: Product[] = [
    { id: 'p1', shop_id: 'demo', name: 'Agua natural', category: 'Bebidas', sku: 'BEB-001', stock: 18, min_stock: 8, sale_price: 20, unit_cost: 8 },
    { id: 'p2', shop_id: 'demo', name: 'Refresco cola', category: 'Bebidas', sku: 'BEB-002', stock: 12, min_stock: 6, sale_price: 25, unit_cost: 12 },
    { id: 'p3', shop_id: 'demo', name: 'Agua mineral', category: 'Bebidas', sku: 'BEB-003', stock: 4, min_stock: 6, sale_price: 28, unit_cost: 13 },
    { id: 'p4', shop_id: 'demo', name: 'Pomada mate', category: 'Cuidado personal', sku: 'CUI-001', stock: 9, min_stock: 4, sale_price: 120, unit_cost: 62 },
    { id: 'p5', shop_id: 'demo', name: 'Aceite para barba', category: 'Cuidado personal', sku: 'CUI-002', stock: 6, min_stock: 3, sale_price: 150, unit_cost: 80 },
    { id: 'p6', shop_id: 'demo', name: 'Cera para cabello', category: 'Cuidado personal', sku: 'CUI-003', stock: 7, min_stock: 3, sale_price: 95, unit_cost: 48 },
  ];
  const expenses: Expense[] = [
    { id: 'e1', concept: 'Compra de bebidas', category: 'Inventario', amount: 420, note: 'Reposición semanal', created_at: day(0, 9) },
    { id: 'e2', concept: 'Compra de navajas', category: 'Insumos', amount: 230, note: 'Insumos de trabajo', created_at: day(2, 9) },
    { id: 'e3', concept: 'Pago de luz', category: 'Servicios', amount: 510, note: 'Recibo mensual', created_at: day(4, 9) },
  ];
  const services: Service[] = [
    { id: 'sv1', shop_id: 'demo', name: 'Corte clásico', price: 180, duration_minutes: 30 },
    { id: 'sv2', shop_id: 'demo', name: 'Fade', price: 200, duration_minutes: 40 },
    { id: 'sv3', shop_id: 'demo', name: 'Corte + barba', price: 280, duration_minutes: 55 },
    { id: 'sv4', shop_id: 'demo', name: 'Arreglo de barba', price: 140, duration_minutes: 25 },
  ];
  return { sales, products, expenses, clients: demoClients, services };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [demo, setDemo] = useState(false);
  const [page, setPage] = useState<Page>('home');
  const [shop, setShop] = useState<Shop | null>(null);
  const [role, setRole] = useState('owner');
  const [needsShop, setNeedsShop] = useState(false);
  const [shopName, setShopName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [filter, setFilter] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [closings, setClosings] = useState<Closing[]>([]);
  const [moves, setMoves] = useState<InventoryMove[]>([]);
  const [modal, setModal] = useState<ModalKind>(null);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [quickProduct, setQuickProduct] = useState('');
  const [currency, setCurrency] = useState('MXN');

  const message = (text: string, isError = false) => { setNotice(isError ? '' : text); setError(isError ? text : ''); window.setTimeout(() => { setNotice(''); setError(''); }, 4200); };

  const loadShop = useCallback(async (userId: string) => {
    if (!supabase) return;
    setBusy(true); setError('');
    try {
      const { data, error: queryError } = await supabase.from('shop_members').select('shop_id,role,shops!inner(id,name,currency,phone,address)').eq('user_id', userId).limit(1).maybeSingle();
      if (queryError) throw queryError;
      if (!data) { setShop(null); setNeedsShop(true); return; }
      const relation = data.shops as unknown as Shop | Shop[];
      const selected = Array.isArray(relation) ? relation[0] : relation;
      if (!selected) throw new Error('No encontramos los datos de la barbería. Revisa el esquema de Supabase.');
      setShop(selected); setRole(data.role); setCurrency(selected.currency || 'MXN'); setNeedsShop(false);
      await loadData(selected.id);
    } catch (e) { message(e instanceof Error ? e.message : 'No se pudo cargar la barbería.', true); }
    finally { setBusy(false); }
  }, []);

  const loadData = useCallback(async (shopId: string) => {
    if (!supabase) return;
    const results = await Promise.all([
      supabase.from('products').select('*').eq('shop_id', shopId).eq('active', true).order('name'),
      supabase.from('services').select('*').eq('shop_id', shopId).eq('active', true).order('name'),
      supabase.from('clients').select('*').eq('shop_id', shopId).order('name'),
      supabase.from('sales').select('*,sale_items(item_name,quantity,service_id,product_id)').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(300),
      supabase.from('expenses').select('*').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(300),
      supabase.from('daily_closings').select('*').eq('shop_id', shopId).order('business_day', { ascending: false }).limit(60),
      supabase.from('inventory_movements').select('*').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(30),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
    setProducts((results[0].data || []) as Product[]); setServices((results[1].data || []) as Service[]);
    setClients((results[2].data || []) as Client[]); setSales((results[3].data || []) as Sale[]);
    setExpenses((results[4].data || []) as Expense[]); setClosings((results[5].data || []) as Closing[]); setMoves((results[6].data || []) as InventoryMove[]);
  }, []);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) message(sessionError.message, true);
      setSession(data.session); setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session?.user) void loadShop(session.user.id); else { setShop(null); setNeedsShop(false); } }, [session, loadShop]);

  const demoData = useMemo(() => demoSeed(), []);
  const activeProducts = demo ? demoData.products : products;
  const activeServices = demo ? demoData.services : services;
  const activeClients = demo ? demoData.clients : clients;
  const activeSales = demo ? demoData.sales : sales;
  const activeExpenses = demo ? demoData.expenses : expenses;
  const businessName = demo ? 'Casa Norte Barbería' : shop?.name || 'BarberOS';
  const todaysSales = activeSales.filter((s) => dateKey(s.created_at) === today());
  const todaysExpenses = activeExpenses.filter((e) => dateKey(e.created_at) === today());
  const incomeToday = todaysSales.reduce((sum, item) => sum + Number(item.total), 0);
  const expenseToday = todaysExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const serviceCountToday = todaysSales.filter((s) => s.detail ? !s.detail.startsWith('Producto:') : s.sale_items?.some((item) => item.service_id)).length;
  const lowStock = activeProducts.filter((p) => p.stock <= p.min_stock);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); const key = dateKey(d);
    return { day: new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(d).replace('.', ''),
      income: activeSales.filter((s) => dateKey(s.created_at) === key).reduce((n, s) => n + Number(s.total), 0),
      expenses: activeExpenses.filter((e) => dateKey(e.created_at) === key).reduce((n, e) => n + Number(e.amount), 0) };
  });
  const netToday = incomeToday - expenseToday;

  const signIn = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase) return;
    setBusy(true); setError('');
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
    setBusy(false); if (loginError) message(loginError.message, true); else message('Sesión iniciada.');
  };
  const signUp = async () => {
    if (!supabase) return;
    setBusy(true); setError('');
    const { data, error: signUpError } = await supabase.auth.signUp({ email: loginEmail.trim(), password: loginPassword });
    setBusy(false);
    if (signUpError) return message(signUpError.message, true);
    if (!data.session) message('Revisa tu correo para confirmar la cuenta. Después vuelve e inicia sesión.');
    else message('Cuenta creada. Configura el nombre de tu barbería para continuar.');
  };
  const createShop = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase || !shopName.trim()) return;
    setBusy(true); setError('');
    const { error: createError } = await supabase.rpc('create_barbershop', { shop_name: shopName.trim() });
    if (createError) { setBusy(false); return message(createError.message, true); }
    await loadShop(session!.user.id); setBusy(false); message('Barbería creada. Ya puedes empezar a registrar operaciones.');
  };
  const signOut = async () => { await supabase?.auth.signOut(); setSession(null); setPage('home'); };

  const afterWrite = async (success: string) => { if (shop) await loadData(shop.id); setModal(null); setQuickProduct(''); setEditClient(null); message(success); };
  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!supabase || !shop) return;
    const f = new FormData(event.currentTarget);
    const { error: writeError } = await supabase.from('products').insert({ shop_id: shop.id, name: String(f.get('name')).trim(), category: String(f.get('category')), sku: String(f.get('sku') || '').trim(), stock: Number(f.get('stock')), min_stock: Number(f.get('min_stock')), sale_price: Number(f.get('sale_price')), unit_cost: Number(f.get('unit_cost')) });
    if (writeError) return message(writeError.message, true); await afterWrite('Producto agregado al inventario.');
  };
  const adjustStock = async (product: Product, delta: number) => {
    if (demo) return message('La demostración no guarda cambios.'); if (!supabase) return;
    const { error: updateError } = await supabase.rpc('adjust_product_stock', { p_shop_id: product.shop_id, p_product_id: product.id, p_delta: delta, p_unit_cost: product.unit_cost, p_note: delta > 0 ? 'Entrada de inventario' : 'Ajuste manual' });
    if (updateError) return message(updateError.message, true); await loadData(product.shop_id); message('Existencias actualizadas y movimiento auditado.');
  };
  const createExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!supabase || !shop || !session) return;
    const f = new FormData(event.currentTarget);
    const { error: writeError } = await supabase.from('expenses').insert({ shop_id: shop.id, concept: String(f.get('concept')).trim(), category: String(f.get('category')), amount: Number(f.get('amount')), note: String(f.get('note') || '').trim(), created_by: session.user.id });
    if (writeError) return message(writeError.message, true); await afterWrite('Gasto guardado en caja.');
  };
  const createClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!supabase || !shop) return;
    const f = new FormData(event.currentTarget);
    const clientData = { name: String(f.get('name')).trim(), phone: String(f.get('phone') || '').trim(), notes: String(f.get('notes') || '').trim() };
    const { error: writeError } = editClient
      ? await supabase.from('clients').update(clientData).eq('id', editClient.id).eq('shop_id', shop.id)
      : await supabase.from('clients').insert({ shop_id: shop.id, ...clientData });
    if (writeError) return message(writeError.message, true); await afterWrite(editClient ? 'Datos del cliente actualizados.' : 'Cliente guardado.');
  };
  const recordSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!supabase || !shop) return;
    const f = new FormData(event.currentTarget); const type = String(f.get('item_type'));
    const id = String(f.get('item_id')); const quantity = Number(f.get('quantity'));
    const { error: writeError } = await supabase.rpc('register_sale', { p_shop_id: shop.id, p_client_id: String(f.get('client_id') || '') || null, p_payment_method: String(f.get('payment_method')), p_items: [{ type, id, quantity }] });
    if (writeError) return message(writeError.message, true); await afterWrite('Venta registrada y caja actualizada.');
  };
  const recordQuickSale = async (product: Product) => { setQuickProduct(product.id); setModal('sale'); };
  const closeCash = async () => {
    if (demo) return message('El cierre es solo de muestra.'); if (!supabase || !shop) return;
    const { error: closeError } = await supabase.rpc('close_shop_day', { p_shop_id: shop.id, p_day: today() });
    if (closeError) return message(closeError.message, true); await loadData(shop.id); message('Cierre del día guardado.');
  };
  const saveShop = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!supabase || !shop) return;
    const f = new FormData(event.currentTarget);
    const { error: updateError } = await supabase.from('shops').update({ name: String(f.get('name')).trim(), phone: String(f.get('phone') || ''), address: String(f.get('address') || ''), currency: String(f.get('currency')) }).eq('id', shop.id);
    if (updateError) return message(updateError.message, true); await loadShop(session!.user.id); message('Datos del negocio actualizados.');
  };
  const exportReport = () => {
    const report = { shop: businessName, exported_at: new Date().toISOString(), sales: activeSales, expenses: activeExpenses, products: activeProducts, clients: activeClients };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `barberos-respaldo-${today()}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const downloadExcelReport = () => {
    const cutCount = todaysSales.filter((sale) => sale.detail
      ? activeServices.some((service) => service.name === sale.detail)
      : sale.sale_items?.some((item) => Boolean(item.service_id))).length;
    const clientName = (id: string | null) => activeClients.find((client) => client.id === id)?.name || 'Venta de mostrador';
    const detailFor = (sale: Sale) => sale.detail || sale.sale_items?.map((item) => `${item.item_name} × ${item.quantity}`).join(', ') || '—';
    const inventoryValue = activeProducts.reduce((sum, product) => sum + product.stock * product.unit_cost, 0);
    const sheets: ReportSheet[] = [
      { name: 'Resumen del día', rows: [['Indicador', 'Resultado'], ['Barbería', businessName], ['Fecha del reporte', today()], ['Cortes y servicios de hoy', cutCount], ['Operaciones de venta de hoy', todaysSales.length], ['Ingresos de hoy', incomeToday], ['Gastos de hoy', expenseToday], ['Neto estimado de hoy', netToday], ['Productos en inventario', activeProducts.length], ['Unidades disponibles', activeProducts.reduce((sum, product) => sum + product.stock, 0)], ['Valor del inventario al costo', inventoryValue], ['Productos por reponer', lowStock.length], ['Generado', new Date().toLocaleString('es-MX')]] },
      { name: 'Ventas', rows: [['Fecha y hora', 'Cliente', 'Barbero', 'Detalle', 'Método de pago', 'Total'], ...activeSales.map((sale) => [sale.created_at, clientName(sale.client_id), sale.barber_id || '—', detailFor(sale), sale.payment_method, Number(sale.total)])] },
      { name: 'Gastos', rows: [['Fecha y hora', 'Concepto', 'Categoría', 'Nota', 'Importe'], ...activeExpenses.map((expense) => [expense.created_at, expense.concept, expense.category, expense.note || '—', Number(expense.amount)])] },
      { name: 'Inventario', rows: [['Producto', 'Categoría', 'SKU', 'Existencia', 'Mínimo', 'Costo unitario', 'Precio de venta', 'Valor al costo', 'Estado'], ...activeProducts.map((product) => [product.name, product.category, product.sku || '—', Number(product.stock), Number(product.min_stock), Number(product.unit_cost), Number(product.sale_price), Number(product.stock) * Number(product.unit_cost), product.stock <= product.min_stock ? 'REABASTECER' : 'Disponible'])] },
      { name: 'Cierres diarios', rows: [['Día', 'Ventas', 'Ingresos', 'Gastos', 'Neto', 'Cerrado'], ...closings.map((closing) => [closing.business_day, Number(closing.sale_count), Number(closing.sales_total), Number(closing.expenses_total), Number(closing.net_total), closing.closed_at])] },
      { name: 'Movimientos', rows: [['Fecha y hora', 'Producto', 'Tipo', 'Cantidad', 'Detalle'], ...moves.map((move) => [move.created_at, activeProducts.find((product) => product.id === move.product_id)?.name || 'Producto archivado', move.kind === 'sale' ? 'Venta' : move.kind === 'restock' ? 'Reposición' : 'Ajuste', Number(move.quantity), move.note || '—'])] },
    ];
    const url = URL.createObjectURL(createExcelWorkbook(sheets));
    const link = document.createElement('a'); link.href = url; link.download = `reporte-${today()}.xlsx`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('Reporte Excel generado con los datos del sistema.');
  };

  if (!authReady || busy && !session) return <div className="boot"><div className="brand-mark">B</div><p>Preparando BarberOS…</p></div>;
  if (!session && !demo) return <Login email={loginEmail} password={loginPassword} setEmail={setLoginEmail} setPassword={setLoginPassword} onLogin={signIn} onSignUp={signUp} onDemo={() => setDemo(true)} busy={busy} error={error} notice={notice} hasConfig={hasBackendConfig} />;
  if (needsShop && session) return <main className="onboard"><div className="brand-mark">B</div><div className="eyebrow">PRIMEROS PASOS</div><h1>Configura tu barbería</h1><p>La primera cuenta crea el espacio privado donde guardarás ventas, gastos y productos.</p><form onSubmit={createShop}><label>Nombre del negocio<input required minLength={2} maxLength={100} value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Ej. Casa Norte Barbería" /></label><button className="button primary" disabled={busy}>{busy ? 'Creando…' : 'Crear mi barbería'}</button><button type="button" className="button quiet" onClick={signOut}>Cerrar sesión</button></form>{error && <p className="form-error">{error}</p>}</main>;

  const current = nav.find((item) => item.id === page)!;
  const pageTitles: Record<Page, [string, string]> = {
    home: ['Resumen de hoy', 'El estado de caja e inventario de tu barbería.'], sales: ['Caja y cortes', 'Registra servicios y consulta las operaciones.'],
    inventory: ['Inventario', 'Productos, existencias y alertas de reposición.'], expenses: ['Gastos', 'Controla las salidas de dinero del negocio.'],
    clients: ['Clientes', 'Historial y datos de contacto de tu clientela.'], reports: ['Reportes', 'Resultados del negocio y cierres de caja.'], settings: ['Ajustes', 'Información y preferencias de la barbería.'],
  };
  const title = pageTitles[page];
  const shownSales = activeSales.filter((s) => {
    const client = activeClients.find((c) => c.id === s.client_id)?.name || 'Venta de mostrador';
    const detail = s.detail || s.sale_items?.map((i) => `${i.item_name} × ${i.quantity}`).join(' ') || '';
    return `${client} ${s.payment_method} ${detail}`.toLowerCase().includes(filter.toLowerCase());
  });
  const shownProducts = activeProducts.filter((p) => `${p.name} ${p.category} ${p.sku}`.toLowerCase().includes(filter.toLowerCase()));
  const shownClients = activeClients.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(filter.toLowerCase()));

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">B</div><div><strong>BarberOS</strong><small>CONTROL DE NEGOCIO</small></div></div>
      <div className="nav-caption">ESPACIO DE TRABAJO</div><nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} onClick={() => { setPage(id); setFilter(''); }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{page === id && <ChevronRight size={14} className="nav-arrow" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="shop-mini"><div className="shop-avatar">{businessName[0]}</div><div className="shop-mini-copy"><strong>{businessName}</strong><small>{demo ? 'Modo de demostración' : `${role === 'owner' ? 'Propietario' : role} · sesión segura`}</small></div><button aria-label="Cerrar sesión" title="Cerrar sesión" className="icon-button" onClick={() => { if (demo) setDemo(false); else void signOut(); }}><LogOut size={16} /></button></div><div className="secure-note"><span className="secure-dot" /> {demo ? 'Datos ficticios' : 'Conexión protegida'}</div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="mobile-brand"><div className="brand-mark">B</div><strong>BarberOS</strong></div><div className="crumb"><span>BARBEROS</span><ChevronRight size={13} /><strong>{current.label.toUpperCase()}</strong></div><div className="topbar-actions"><div className="today-label"><CalendarDays size={15} />{new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</div><button className="button primary top-add" onClick={() => setModal('sale')}><Plus size={16} /> Registrar venta</button></div></header>
      {demo && <div className="demo-banner"><span><Activity size={15} /> Vista de muestra</span> Datos ficticios, solo para explorar. No se guardan ni sincronizan.<button onClick={() => setDemo(false)}>Salir del demo <X size={14} /></button></div>}
      <section className="page-heading"><div><div className="eyebrow">{businessName.toUpperCase()}</div><h1>{title[0]}</h1><p>{title[1]}</p></div>{page === 'sales' && <button className="button primary" onClick={() => setModal('sale')}><Plus size={16} /> Nueva venta</button>}{page === 'inventory' && <button className="button primary" onClick={() => setModal('product')}><Plus size={16} /> Nuevo producto</button>}{page === 'expenses' && <button className="button primary" onClick={() => setModal('expense')}><Plus size={16} /> Registrar gasto</button>}{page === 'clients' && <button className="button primary" onClick={() => { setEditClient(null); setModal('client'); }}><Plus size={16} /> Nuevo cliente</button>}</section>
      {error && <div className="flash error"><AlertTriangle size={16} />{error}<button onClick={() => setError('')}><X size={15} /></button></div>}{notice && <div className="flash success"><Check size={16} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}

      {page === 'home' && <>
        <div className="metric-grid">
          <Metric title="Ingresos de hoy" value={cash(incomeToday,currency)} foot={`${todaysSales.length} ventas registradas`} icon={<ArrowUpRight size={17} />} tone="green" />
          <Metric title="Gastos de hoy" value={cash(expenseToday,currency)} foot={`${todaysExpenses.length} movimientos`} icon={<ArrowDownRight size={17} />} tone="sand" />
          <Metric title="Balance neto" value={cash(netToday,currency)} foot="Ingresos menos gastos" icon={<CircleDollarSign size={17} />} tone="ink" />
          <Metric title="Cortes y servicios" value={String(serviceCountToday)} foot={`${activeClients.length} clientes en cartera`} icon={<Scissors size={17} />} tone="blue" />
        </div>
        <div className="dashboard-grid"><section className="panel chart-panel"><div className="panel-head"><div><h2>Movimiento semanal</h2><p>Ingresos y gastos de los últimos siete días</p></div><span className="period-chip">7 días</span></div><div className="chart-legend"><span><i className="legend-income" />Ingresos</span><span><i className="legend-expense" />Gastos</span></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={week} margin={{ top: 8, right: 0, left: -14, bottom: 0 }} barGap={4}><CartesianGrid vertical={false} stroke="#e9e4da" strokeDasharray="3 4" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#8c8980', fontSize: 11 }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8c8980', fontSize: 10 }} tickFormatter={(v) => `${v}`} /><Tooltip formatter={(v) => cash(Number(v),currency)} contentStyle={{ borderRadius: 10, border: '1px solid #e4ded2', fontSize: 12 }} /><Bar dataKey="income" name="Ingresos" fill="#a95033" radius={[5,5,0,0]} maxBarSize={22} /><Bar dataKey="expenses" name="Gastos" fill="#cdbba6" radius={[5,5,0,0]} maxBarSize={22} /></BarChart></ResponsiveContainer></div></section>
          <section className="panel stock-panel"><div className="panel-head"><div><h2>Productos por reponer</h2><p>Existencias en el mínimo o por debajo</p></div><button className="text-link" onClick={() => setPage('inventory')}>Ver inventario <ChevronRight size={14} /></button></div>{lowStock.length ? <div className="low-stock-list">{lowStock.slice(0,4).map((p) => <div className="low-stock-row" key={p.id}><div className="product-symbol">{p.category === 'Bebidas' ? '◌' : '✳'}</div><div className="stock-copy"><strong>{p.name}</strong><small>{p.category}</small></div><span className="stock-count">{p.stock} <small>uds</small></span></div>)}</div> : <Empty icon={<Package size={22} />} title="Todo en orden" text="No tienes productos por debajo del mínimo." />}</section></div>
        <div className="dashboard-grid lower-grid"><section className="panel"><div className="panel-head"><div><h2>Últimas ventas</h2><p>Actividad reciente de caja</p></div><button className="text-link" onClick={() => setPage('sales')}>Ver todas <ChevronRight size={14} /></button></div><SalesTable rows={activeSales.slice(0,5)} clients={activeClients} currency={currency} /></section><section className="panel cash-panel"><div className="panel-head"><div><h2>Caja del día</h2><p>Resumen de movimientos</p></div><span className="cash-icon"><Wallet size={17} /></span></div><div className="cash-line"><span>Ventas cobradas</span><strong>{cash(incomeToday,currency)}</strong></div><div className="cash-line"><span>Gastos pagados</span><strong className="expense-value">− {cash(expenseToday,currency)}</strong></div><div className="cash-total"><span>Disponible neto</span><strong>{cash(netToday,currency)}</strong></div><button className="button quiet full-width" onClick={() => void closeCash()}><ClipboardCheck size={16} /> Hacer cierre del día</button></section></div>
      </>}

      {page === 'sales' && <section className="panel"><div className="table-toolbar"><Search size={16} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar cliente o método de pago" /></div><SalesTable rows={shownSales.slice(0,100)} clients={activeClients} currency={currency} /></section>}
      {page === 'inventory' && <><div className="inventory-summary"><Metric title="Artículos activos" value={String(activeProducts.length)} foot="Productos registrados" icon={<Package size={17}/>} tone="green" /><Metric title="Bajo mínimo" value={String(lowStock.length)} foot="Requieren atención" icon={<AlertTriangle size={17}/>} tone="sand" /><Metric title="Valor al costo" value={cash(activeProducts.reduce((s,p)=>s+p.stock*p.unit_cost,0),currency)} foot="Existencias estimadas" icon={<CircleDollarSign size={17}/>} tone="ink" /></div><section className="panel"><div className="table-toolbar"><Search size={16}/><input value={filter} onChange={(e)=>setFilter(e.target.value)} placeholder="Buscar por nombre, categoría o SKU" /></div><div className="table-wrap"><table><thead><tr><th>PRODUCTO</th><th>CATEGORÍA</th><th>SKU</th><th>EXISTENCIAS</th><th>PRECIO</th><th>ESTADO</th><th>ACCIONES</th></tr></thead><tbody>{shownProducts.map(p=><tr key={p.id}><td><strong className="table-name">{p.name}</strong></td><td>{p.category}</td><td className="muted-cell">{p.sku || '—'}</td><td><strong>{p.stock}</strong> <span className="muted-cell">/ min. {p.min_stock}</span></td><td>{cash(p.sale_price,currency)}</td><td><span className={p.stock<=p.min_stock?'status-pill warn':'status-pill good'}>{p.stock<=p.min_stock?'Reponer':'Disponible'}</span></td><td><div className="row-actions"><button className="tiny-button" title="Reducir una unidad" onClick={()=>void adjustStock(p,-1)}>−</button><button className="tiny-button" title="Agregar una unidad" onClick={()=>void adjustStock(p,1)}>+</button><button className="tiny-button sell-button" onClick={()=>void recordQuickSale(p)}>Vender</button></div></td></tr>)}</tbody></table>{!shownProducts.length&&<Empty icon={<Package size={22}/>} title="Sin productos" text="Agrega bebidas e insumos para empezar el control de inventario." />}</div></section></>}
      {page === 'inventory' && !demo && <InventoryLog movements={moves} products={products} />}
      {page === 'expenses' && <section className="panel"><div className="table-wrap"><table><thead><tr><th>CONCEPTO</th><th>CATEGORÍA</th><th>FECHA</th><th>NOTA</th><th>IMPORTE</th></tr></thead><tbody>{activeExpenses.map(e=><tr key={e.id}><td><strong className="table-name">{e.concept}</strong></td><td><span className="category-chip">{e.category}</span></td><td>{readableDate(e.created_at)}</td><td className="muted-cell">{e.note||'—'}</td><td className="expense-value">− {cash(e.amount,currency)}</td></tr>)}</tbody></table>{!activeExpenses.length&&<Empty icon={<Receipt size={22}/>} title="Sin gastos registrados" text="Registra los gastos para conocer el balance neto." />}</div></section>}
      {page === 'clients' && <section className="panel"><div className="table-toolbar"><Search size={16}/><input value={filter} onChange={(e)=>setFilter(e.target.value)} placeholder="Buscar nombre o teléfono" /></div><div className="table-wrap"><table><thead><tr><th>CLIENTE</th><th>TELÉFONO</th><th>VISITAS</th><th>ÚLTIMA VISITA</th><th>GASTO ACUMULADO</th><th>ACCIONES</th></tr></thead><tbody>{shownClients.map(c=>{const records=activeSales.filter(s=>s.client_id===c.id);const spent=records.reduce((sum,s)=>sum+Number(s.total),0);const latest=records[0];return <tr key={c.id}><td><div className="client-cell"><span className="client-avatar">{c.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span><strong className="table-name">{c.name}</strong></div></td><td>{c.phone||'—'}</td><td>{records.length}</td><td>{latest?readableDate(latest.created_at):'—'}</td><td>{cash(spent,currency)}</td><td><button className="tiny-button" onClick={()=>{setEditClient(c);setModal('client');}}>Editar</button></td></tr>})}</tbody></table>{!shownClients.length&&<Empty icon={<Users size={22}/>} title="Tu cartera empieza aquí" text="Guarda a tus clientes para consultar sus visitas." />}</div></section>}
      {page === 'reports' && <><section className="panel report-export-panel"><div className="panel-head"><div><h2>Reporte del día · {today()}</h2><p>Datos del panel, resumidos y descargables para Excel.</p></div><button className="button primary" onClick={downloadExcelReport}><Download size={15}/> Descargar reporte Excel</button></div><div className="report-today-grid"><div><small>Cortes y servicios</small><strong>{serviceCountToday}</strong></div><div><small>Ventas</small><strong>{cash(incomeToday,currency)}</strong></div><div><small>Gastos</small><strong>{cash(expenseToday,currency)}</strong></div><div><small>Neto estimado</small><strong>{cash(netToday,currency)}</strong></div></div></section><div className="metric-grid three"><Metric title="Ingresos históricos" value={cash(activeSales.reduce((a,s)=>a+Number(s.total),0),currency)} foot="Ventas registradas" icon={<ArrowUpRight size={17}/>} tone="green" /><Metric title="Gastos históricos" value={cash(activeExpenses.reduce((a,e)=>a+Number(e.amount),0),currency)} foot="Gastos registrados" icon={<ArrowDownRight size={17}/>} tone="sand" /><Metric title="Utilidad estimada" value={cash(activeSales.reduce((a,s)=>a+Number(s.total),0)-activeExpenses.reduce((a,e)=>a+Number(e.amount),0),currency)} foot="Ventas menos gastos" icon={<CircleDollarSign size={17}/>} tone="ink" /></div><section className="panel"><div className="panel-head"><div><h2>Cierres diarios</h2><p>Totales guardados por día</p></div><button className="button quiet" onClick={()=>void closeCash()}><ClipboardCheck size={15}/> Cerrar día actual</button></div><div className="table-wrap"><table><thead><tr><th>DÍA</th><th>VENTAS</th><th>INGRESOS</th><th>GASTOS</th><th>NETO</th><th>CERRADO</th></tr></thead><tbody>{(demo?[]:closings).map(c=><tr key={c.id}><td>{c.business_day}</td><td>{c.sale_count}</td><td>{cash(c.sales_total,currency)}</td><td className="expense-value">{cash(c.expenses_total,currency)}</td><td><strong>{cash(c.net_total,currency)}</strong></td><td>{readableDate(c.closed_at)}</td></tr>)}</tbody></table>{(!closings.length||demo)&&<Empty icon={<BarChart3 size={22}/>} title="Aún no hay cierres" text="Cierra tu primer día para guardar un corte formal de caja." />}</div></section></>}
      {page === 'settings' && <div className="settings-grid"><section className="panel"><div className="panel-head"><div><h2>Datos del negocio</h2><p>Información visible en tu panel</p></div></div>{demo?<p className="muted-cell">Los ajustes se desactivan en la demostración.</p>:<form className="form-grid" onSubmit={saveShop}><label>Nombre del negocio<input name="name" required defaultValue={shop?.name}/></label><label>Teléfono<input name="phone" defaultValue={shop?.phone}/></label><label className="span-two">Dirección<input name="address" defaultValue={shop?.address}/></label><label>Moneda<select name="currency" defaultValue={shop?.currency||'MXN'}><option>MXN</option><option>USD</option><option>COP</option><option>ARS</option></select></label><div className="align-end"><button className="button primary"><Check size={15}/> Guardar cambios</button></div></form>}</section><section className="panel"><div className="panel-head"><div><h2>Cuenta y seguridad</h2><p>Acceso con Supabase Auth</p></div></div><div className="settings-row"><div><strong>Sesión</strong><small>{demo?'Modo de muestra':session?.user.email}</small></div><span className="status-pill good">{demo?'Demo':'Protegida'}</span></div><div className="settings-row"><div><strong>Rol de acceso</strong><small>Permisos de esta cuenta en la barbería</small></div><span className="category-chip">{demo?'Vista previa':role}</span></div><button className="button quiet full-width" onClick={()=>{if(demo)setDemo(false);else void signOut();}}><LogOut size={15}/>{demo?'Salir de demostración':'Cerrar sesión'}</button></section><section className="panel"><div className="panel-head"><div><h2>Respaldo</h2><p>Descarga una copia de tus datos</p></div></div><p className="body-copy">Exporta ventas, gastos, productos y clientes en formato JSON para conservar un respaldo.</p><button className="button quiet" onClick={exportReport}>Descargar respaldo</button></section></div>}
      <footer className="app-footer"><span>BarberOS Pro</span><span>{demo?'Modo de demostración · Datos ficticios':'Control de barbería · Supabase'}</span></footer>
    </main>
    <nav className="mobile-nav">{nav.map(({id,label,icon:Icon})=><button key={id} className={page===id?'selected':''} onClick={()=>{setPage(id);setFilter('');}}><Icon size={18}/><span>{label}</span></button>)}</nav>
    {modal && <Modal title={modal==='sale'?'Registrar venta':modal==='product'?'Agregar producto':modal==='expense'?'Registrar gasto':editClient?'Editar cliente':'Nuevo cliente'} onClose={()=>{setModal(null);setQuickProduct('');setEditClient(null);}}>
      {modal==='sale'&&<SaleForm services={activeServices} products={activeProducts} clients={activeClients} currency={currency} initialProduct={quickProduct} demo={demo} onSubmit={recordSale} />}
      {modal==='product'&&<ProductForm onSubmit={createProduct} />}
      {modal==='expense'&&<ExpenseForm onSubmit={createExpense} />}
      {modal==='client'&&<ClientForm onSubmit={createClient} client={editClient} />}
    </Modal>}
  </div>;
}

function Login({ email, password, setEmail, setPassword, onLogin, onSignUp, onDemo, busy, error, notice, hasConfig }: { email:string; password:string; setEmail:(s:string)=>void; setPassword:(s:string)=>void; onLogin:(e:FormEvent<HTMLFormElement>)=>void; onSignUp:()=>void; onDemo:()=>void; busy:boolean; error:string; notice:string; hasConfig:boolean }) {
  return <main className="login-shell"><div className="login-aside"><div className="brand light"><div className="brand-mark">B</div><div><strong>BarberOS</strong><small>CONTROL DE NEGOCIO</small></div></div><div className="login-promo"><span className="eyebrow">GESTIÓN PARA BARBERÍAS</span><h1>Tu negocio,<br/><em>en orden.</em></h1><p>Cortes, caja e inventario bajo control. Una herramienta clara para el trabajo de todos los días.</p><div className="promo-points"><span><Check size={16}/> Caja con cierres diarios</span><span><Check size={16}/> Inventario con alertas</span><span><Check size={16}/> Datos privados por barbería</span></div></div><div className="promo-bottom">BarberOS · Administración sencilla, decisiones claras.</div></div><section className="login-card-area"><form className="login-card" onSubmit={onLogin}><div className="login-icon"><Scissors size={20}/></div><span className="eyebrow">BIENVENIDO DE VUELTA</span><h2>Inicia sesión</h2><p>Accede al panel privado de tu barbería.</p><label>Correo electrónico<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@tubarberia.com"/></label><label>Contraseña<input type="password" minLength={8} required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo 8 caracteres"/></label>{error&&<div className="form-error">{error}</div>}{notice&&<div className="form-notice">{notice}</div>}<button className="button primary login-submit" disabled={busy||!hasConfig}>{busy?'Conectando…':'Entrar al panel'}</button>{!hasConfig&&<p className="config-hint">Falta configurar Supabase: copia `.env.example` a `.env` y agrega la URL y la clave pública.</p>}<button type="button" className="text-link signup-link" onClick={onSignUp} disabled={busy||!hasConfig}>Crear cuenta de administrador <ChevronRight size={15}/></button><div className="login-divider"><span>o</span></div><button type="button" className="button quiet demo-login" onClick={onDemo}>Explorar demostración</button><small className="login-privacy">La demostración solo utiliza información ficticia y no guarda cambios.</small></form></section></main>;
}
function Metric({title,value,foot,icon,tone}:{title:string;value:string;foot:string;icon:ReactNode;tone:string}) { return <article className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><strong className="metric-value">{value}</strong><span className="metric-foot">{foot}</span></article>; }
function Empty({icon,title,text}:{icon:ReactNode;title:string;text:string}) { return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div>; }
function InventoryLog({movements,products}:{movements:InventoryMove[];products:Product[]}) { return <section className="panel" style={{marginTop:14}}><div className="panel-head"><div><h2>Bitácora de inventario</h2><p>Ventas, reposiciones y ajustes recientes</p></div><span className="category-chip">{movements.length} movimientos</span></div><div className="table-wrap"><table><thead><tr><th>PRODUCTO</th><th>MOVIMIENTO</th><th>CANTIDAD</th><th>DETALLE</th><th>FECHA</th></tr></thead><tbody>{movements.map(m=>{const p=products.find(x=>x.id===m.product_id);return <tr key={m.id}><td><strong className="table-name">{p?.name||'Producto archivado'}</strong></td><td><span className="category-chip">{m.kind==='sale'?'Venta':m.kind==='restock'?'Reposición':'Ajuste'}</span></td><td className={m.quantity<0?'expense-value':''}>{m.quantity>0?'+':''}{m.quantity}</td><td className="muted-cell">{m.note||'—'}</td><td>{readableDate(m.created_at)}</td></tr>})}</tbody></table>{!movements.length&&<Empty icon={<Package size={22}/>} title="Sin movimientos aún" text="Aquí quedará el historial de ventas y ajustes de existencia." />}</div></section>; }
function SalesTable({rows,clients,currency}:{rows:Sale[];clients:Client[];currency:string}) { return <div className="table-wrap"><table><thead><tr><th>CLIENTE</th><th>SERVICIO / PRODUCTO</th><th>FECHA</th><th>PAGO</th><th>IMPORTE</th></tr></thead><tbody>{rows.map((s)=>{const c=clients.find(x=>x.id===s.client_id);const detail=s.detail||s.sale_items?.map(i=>`${i.item_name} × ${i.quantity}`).join(', ')||'—';return <tr key={s.id}><td><strong className="table-name">{c?.name||'Venta de mostrador'}</strong></td><td>{detail}</td><td>{readableDate(s.created_at)}</td><td><span className="category-chip">{s.payment_method}</span></td><td><strong>{cash(s.total,currency)}</strong></td></tr>})}</tbody></table>{!rows.length&&<Empty icon={<Scissors size={22}/>} title="Sin ventas registradas" text="Registra el primer servicio para comenzar el día." />}</div>; }
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) { return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">BARBEROS</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18}/></button></header>{children}</section></div>; }
function FormActions({onCancel}:{onCancel?:()=>void}) { return <div className="form-actions"><button type="button" className="button quiet" onClick={onCancel??(()=>document.querySelector<HTMLButtonElement>('.modal-card .icon-button')?.click())}>Cancelar</button><button className="button primary"><Check size={15}/>Guardar</button></div>; }
function SaleForm({services,products,clients,currency,initialProduct,demo,onSubmit}:{services:Service[];products:Product[];clients:Client[];currency:string;initialProduct:string;demo:boolean;onSubmit:(e:FormEvent<HTMLFormElement>)=>void}) { const [kind,setKind]=useState(initialProduct?'product':'service');const initial=initialProduct||services[0]?.id||products[0]?.id||'';const [itemId,setItemId]=useState(initial);const item=kind==='product'?products.find(p=>p.id===itemId):services.find(s=>s.id===itemId);const unitPrice=item?(('sale_price' in item)?item.sale_price:item.price):0;const productStock=item&&'stock' in item?item.stock:1;const [qty,setQty]=useState(1);return <form className="form-grid" onSubmit={e=>{if(demo){e.preventDefault();return;}onSubmit(e);}}><label>Tipo de venta<select name="item_type" value={kind} onChange={e=>{setKind(e.target.value);setItemId(e.target.value==='service'?services[0]?.id||'':products[0]?.id||'');}}><option value="service">Servicio</option><option value="product">Producto</option></select></label><label>{kind==='service'?'Servicio':'Producto'}<select name="item_id" required value={itemId} onChange={e=>setItemId(e.target.value)}>{(kind==='service'?services:products).map(x=><option key={x.id} value={x.id}>{x.name}{kind==='product'&&'stock'in x?` · ${x.stock} uds`:''}</option>)}</select></label><label>Cliente (opcional)<select name="client_id" defaultValue=""><option value="">Venta de mostrador</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Método de pago<select name="payment_method"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option></select></label><label>Unidades<input name="quantity" type="number" min="1" max={kind==='product'?productStock:30} value={qty} onChange={e=>setQty(Math.max(1,Number(e.target.value)))} required /></label><div className="price-preview"><span>Total estimado</span><strong>{cash(Number(unitPrice)*qty,currency)}</strong><small>El inventario se descuenta al confirmar productos.</small></div>{demo&&<p className="demo-form-note">En modo demostración no se guardan operaciones.</p>}<div className="span-two"><FormActions /></div></form>; }
function ProductForm({onSubmit}:{onSubmit:(e:FormEvent<HTMLFormElement>)=>void}) { return <form className="form-grid" onSubmit={onSubmit}><label className="span-two">Nombre del producto<input name="name" required maxLength={100} placeholder="Pomada mate" /></label><label>Categoría<select name="category"><option>Bebidas</option><option>Cuidado personal</option><option>Insumos</option><option>Barbería</option><option>Otro</option></select></label><label>SKU / código<input name="sku" maxLength={40} placeholder="Opcional" /></label><label>Existencia inicial<input name="stock" type="number" min="0" step="1" defaultValue="0" required /></label><label>Alerta al llegar a<input name="min_stock" type="number" min="0" step="1" defaultValue="5" required /></label><label>Precio de venta<input name="sale_price" type="number" min="0" step="0.01" defaultValue="0" required /></label><label>Costo por unidad<input name="unit_cost" type="number" min="0" step="0.01" defaultValue="0" required /></label><div className="span-two"><FormActions /></div></form>; }
function ExpenseForm({onSubmit}:{onSubmit:(e:FormEvent<HTMLFormElement>)=>void}) { return <form className="form-grid" onSubmit={onSubmit}><label className="span-two">Concepto<input name="concept" required maxLength={120} placeholder="Ej. Compra de insumos" /></label><label>Categoría<select name="category"><option>Operación</option><option>Inventario</option><option>Renta</option><option>Servicios</option><option>Nómina</option><option>Otro</option></select></label><label>Importe<input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" /></label><label className="span-two">Nota<input name="note" maxLength={240} placeholder="Detalle opcional" /></label><div className="span-two"><FormActions /></div></form>; }
function ClientForm({onSubmit,client}:{onSubmit:(e:FormEvent<HTMLFormElement>)=>void;client:Client|null}) { return <form className="form-grid" onSubmit={onSubmit}><label className="span-two">Nombre completo<input name="name" required maxLength={100} defaultValue={client?.name} placeholder="Nombre del cliente" /></label><label className="span-two">Teléfono<input name="phone" type="tel" maxLength={30} defaultValue={client?.phone} placeholder="Número de contacto" /></label><label className="span-two">Notas<input name="notes" maxLength={240} defaultValue={client?.notes} placeholder="Preferencias, estilo, etc." /></label><div className="span-two"><FormActions /></div></form>; }
