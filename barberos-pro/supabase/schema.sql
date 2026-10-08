-- BarberOS Pro: relational schema with per-shop Row Level Security.
create extension if not exists pgcrypto;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  phone text not null default '', address text not null default '',
  currency text not null default 'MXN' check (currency in ('MXN','USD','COP','ARS')),
  timezone text not null default 'America/Mexico_City',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table if not exists public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'barber' check (role in ('owner','admin','barber')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100), phone text not null default '',
  notes text not null default '', created_at timestamptz not null default now(),
  unique (shop_id, id)
);
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null, price numeric(12,2) not null check (price >= 0), duration_minutes integer not null default 30 check (duration_minutes > 0),
  active boolean not null default true, created_at timestamptz not null default now(), unique (shop_id, id)
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100), category text not null default 'General',
  sku text not null default '', stock integer not null default 0 check (stock >= 0), min_stock integer not null default 0 check (min_stock >= 0),
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0), unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (shop_id, id)
);
create unique index if not exists products_shop_sku_idx on public.products(shop_id, sku) where sku <> '';
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null, user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('sale','restock','adjustment')),
  quantity integer not null check (quantity <> 0), unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  note text not null default '', created_at timestamptz not null default now(),
  foreign key (shop_id, product_id) references public.products(shop_id, id) on delete cascade
);
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  client_id uuid, barber_id uuid not null references auth.users(id), payment_method text not null check (payment_method in ('Efectivo','Tarjeta','Transferencia')),
  total numeric(12,2) not null default 0 check (total >= 0), created_at timestamptz not null default now(),
  foreign key (shop_id, client_id) references public.clients(shop_id, id)
);
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict, service_id uuid references public.services(id) on delete restrict,
  item_name text not null, quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0), unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  check (num_nonnulls(product_id, service_id) = 1)
);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  concept text not null, category text not null default 'Operación', amount numeric(12,2) not null check (amount > 0),
  note text not null default '', created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.daily_closings (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  business_day date not null, sale_count integer not null default 0, sales_total numeric(12,2) not null default 0,
  expenses_total numeric(12,2) not null default 0, net_total numeric(12,2) not null default 0,
  closed_by uuid not null references auth.users(id), closed_at timestamptz not null default now(),
  unique (shop_id, business_day)
);

create index if not exists sales_shop_date_idx on public.sales(shop_id, created_at desc);
create index if not exists expenses_shop_date_idx on public.expenses(shop_id, created_at desc);
create index if not exists products_shop_active_idx on public.products(shop_id, active, name);
create index if not exists clients_shop_name_idx on public.clients(shop_id, name);

create or replace function public.is_shop_member(target_shop uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.shop_members m where m.shop_id = target_shop and m.user_id = auth.uid()) $$;

create or replace function public.current_shop_role(target_shop uuid)
returns text language sql stable security definer set search_path = public
as $$ select m.role from public.shop_members m where m.shop_id = target_shop and m.user_id = auth.uid() limit 1 $$;

create or replace function public.create_barbershop(shop_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_shop uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  if exists(select 1 from public.shop_members where user_id = auth.uid()) then raise exception 'Esta cuenta ya tiene una barbería.'; end if;
  insert into public.shops(name, created_by) values (trim(shop_name), auth.uid()) returning id into new_shop;
  insert into public.shop_members(shop_id, user_id, role) values (new_shop, auth.uid(), 'owner');
  insert into public.services(shop_id, name, price, duration_minutes) values
    (new_shop,'Corte clásico',180,30),(new_shop,'Fade',200,40),(new_shop,'Corte + barba',280,55),(new_shop,'Arreglo de barba',140,25);
  return new_shop;
end;
$$;

create or replace function public.register_sale(
  p_shop_id uuid, p_client_id uuid, p_payment_method text, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public
as $$
declare
  new_sale uuid; row_item jsonb; product_row public.products%rowtype; service_row public.services%rowtype;
  item_qty integer; item_total numeric(12,2); running_total numeric(12,2) := 0;
begin
  if not public.is_shop_member(p_shop_id) then raise exception 'No tienes acceso a esta barbería.'; end if;
  if public.current_shop_role(p_shop_id) not in ('owner','admin','barber') then raise exception 'Permiso insuficiente.'; end if;
  if p_payment_method not in ('Efectivo','Tarjeta','Transferencia') then raise exception 'Método de pago no válido.'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'La lista de conceptos no es válida.'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Agrega al menos un concepto.'; end if;
  if p_client_id is not null and not exists(select 1 from public.clients where id=p_client_id and shop_id=p_shop_id) then raise exception 'Cliente no válido.'; end if;
  insert into public.sales(shop_id, client_id, barber_id, payment_method, total)
    values(p_shop_id, p_client_id, auth.uid(), p_payment_method, 0) returning id into new_sale;
  for row_item in select value from jsonb_array_elements(p_items) loop
    item_qty := coalesce((row_item->>'quantity')::integer,0);
    if item_qty < 1 or item_qty > 100 then raise exception 'La cantidad debe estar entre 1 y 100.'; end if;
    if row_item->>'type' = 'product' then
      select * into product_row from public.products where id=(row_item->>'id')::uuid and shop_id=p_shop_id and active for update;
      if not found then raise exception 'Producto no disponible.'; end if;
      if product_row.stock < item_qty then raise exception 'Existencia insuficiente para %.', product_row.name; end if;
      update public.products set stock=stock-item_qty, updated_at=now() where id=product_row.id;
      item_total := product_row.sale_price * item_qty; running_total := running_total + item_total;
      insert into public.sale_items(sale_id,product_id,item_name,quantity,unit_price,unit_cost)
        values(new_sale,product_row.id,product_row.name,item_qty,product_row.sale_price,product_row.unit_cost);
      insert into public.inventory_movements(shop_id,product_id,user_id,kind,quantity,unit_cost,note)
        values(p_shop_id,product_row.id,auth.uid(),'sale',-item_qty,product_row.unit_cost,'Venta '||new_sale::text);
    elsif row_item->>'type' = 'service' then
      select * into service_row from public.services where id=(row_item->>'id')::uuid and shop_id=p_shop_id and active;
      if not found then raise exception 'Servicio no disponible.'; end if;
      item_total := service_row.price * item_qty; running_total := running_total + item_total;
      insert into public.sale_items(sale_id,service_id,item_name,quantity,unit_price,unit_cost)
        values(new_sale,service_row.id,service_row.name,item_qty,service_row.price,0);
    else raise exception 'Concepto de venta no válido.';
    end if;
  end loop;
  update public.sales set total=running_total where id=new_sale;
  return new_sale;
end;
$$;

create or replace function public.adjust_product_stock(
  p_shop_id uuid, p_product_id uuid, p_delta integer, p_unit_cost numeric default 0, p_note text default ''
) returns integer language plpgsql security definer set search_path = public
as $$
declare product_row public.products%rowtype; next_stock integer;
begin
  if not public.is_shop_member(p_shop_id) or public.current_shop_role(p_shop_id) not in ('owner','admin','barber') then raise exception 'No tienes permiso para modificar este inventario.'; end if;
  if p_delta = 0 then raise exception 'El movimiento debe cambiar al menos una unidad.'; end if;
  select * into product_row from public.products where id=p_product_id and shop_id=p_shop_id and active for update;
  if not found then raise exception 'Producto no encontrado.'; end if;
  next_stock := product_row.stock + p_delta;
  if next_stock < 0 then raise exception 'No hay existencias suficientes.'; end if;
  update public.products set stock=next_stock, unit_cost=case when p_unit_cost>0 then p_unit_cost else unit_cost end, updated_at=now() where id=p_product_id;
  insert into public.inventory_movements(shop_id,product_id,user_id,kind,quantity,unit_cost,note)
    values(p_shop_id,p_product_id,auth.uid(),case when p_delta>0 then 'restock' else 'adjustment' end,p_delta,coalesce(nullif(p_unit_cost,0),product_row.unit_cost),coalesce(p_note,''));
  return next_stock;
end;
$$;

create or replace function public.close_shop_day(p_shop_id uuid, p_day date)
returns public.daily_closings language plpgsql security definer set search_path = public
as $$
declare result public.daily_closings%rowtype; total_sales numeric(12,2); total_expenses numeric(12,2); count_sales integer; shop_timezone text;
begin
  if not public.is_shop_member(p_shop_id) or public.current_shop_role(p_shop_id) not in ('owner','admin') then raise exception 'Solo administración puede cerrar caja.'; end if;
  select timezone into shop_timezone from public.shops where id=p_shop_id;
  select coalesce(sum(total),0), count(*) into total_sales,count_sales from public.sales where shop_id=p_shop_id and (created_at at time zone shop_timezone)::date=p_day;
  select coalesce(sum(amount),0) into total_expenses from public.expenses where shop_id=p_shop_id and (created_at at time zone shop_timezone)::date=p_day;
  insert into public.daily_closings(shop_id,business_day,sale_count,sales_total,expenses_total,net_total,closed_by)
    values(p_shop_id,p_day,count_sales,total_sales,total_expenses,total_sales-total_expenses,auth.uid())
    on conflict(shop_id,business_day) do update set sale_count=excluded.sale_count,sales_total=excluded.sales_total,
      expenses_total=excluded.expenses_total,net_total=excluded.net_total,closed_by=excluded.closed_by,closed_at=now()
    returning * into result;
  return result;
end;
$$;

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.daily_closings enable row level security;

drop policy if exists shop_read_member on public.shops;
create policy shop_read_member on public.shops for select to authenticated using (public.is_shop_member(id));
drop policy if exists shop_update_admin on public.shops;
create policy shop_update_admin on public.shops for update to authenticated using (public.current_shop_role(id) in ('owner','admin')) with check (public.current_shop_role(id) in ('owner','admin'));
drop policy if exists member_read_shop on public.shop_members;
create policy member_read_shop on public.shop_members for select to authenticated using (user_id=auth.uid() or public.is_shop_member(shop_id));

drop policy if exists clients_shop_access on public.clients;
create policy clients_shop_access on public.clients for all to authenticated using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
drop policy if exists services_shop_access on public.services;
create policy services_shop_access on public.services for all to authenticated using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
drop policy if exists products_shop_access on public.products;
create policy products_shop_access on public.products for all to authenticated using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
drop policy if exists inventory_movements_shop_read on public.inventory_movements;
create policy inventory_movements_shop_read on public.inventory_movements for select to authenticated using (public.is_shop_member(shop_id));
drop policy if exists sales_shop_read on public.sales;
create policy sales_shop_read on public.sales for select to authenticated using (public.is_shop_member(shop_id));
drop policy if exists sale_items_shop_read on public.sale_items;
create policy sale_items_shop_read on public.sale_items for select to authenticated using (exists(select 1 from public.sales s where s.id=sale_id and public.is_shop_member(s.shop_id)));
drop policy if exists expenses_shop_access on public.expenses;
create policy expenses_shop_access on public.expenses for all to authenticated using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id) and created_by=auth.uid());
drop policy if exists closings_shop_read on public.daily_closings;
create policy closings_shop_read on public.daily_closings for select to authenticated using (public.is_shop_member(shop_id));

grant usage on schema public to authenticated;
grant select, update on public.shops to authenticated;
grant select on public.shop_members to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, delete on public.services, public.products to authenticated;
grant select, insert on public.expenses to authenticated;
grant select on public.sales, public.sale_items, public.inventory_movements, public.daily_closings to authenticated;
grant execute on function public.is_shop_member(uuid), public.current_shop_role(uuid), public.create_barbershop(text), public.register_sale(uuid,uuid,text,jsonb), public.adjust_product_stock(uuid,uuid,integer,numeric,text), public.close_shop_day(uuid,date) to authenticated;
revoke all on function public.create_barbershop(text), public.register_sale(uuid,uuid,text,jsonb), public.adjust_product_stock(uuid,uuid,integer,numeric,text), public.close_shop_day(uuid,date) from public, anon;
