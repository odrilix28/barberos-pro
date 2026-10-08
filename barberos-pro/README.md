# BarberOS Pro

Aplicación de administración para barbería construida con **React, TypeScript, Vite, Recharts y Supabase**. Incluye autenticación por correo, espacios privados por barbería, caja, servicios, clientes, gastos, inventario con movimientos auditables, cierres y dashboard adaptable a móvil. Desde **Reportes** puedes descargar un archivo Excel generado con los datos cargados en el panel: resumen del día, ventas, gastos, inventario, cierres y movimientos.

## Requisitos

- Node.js 20 o 22 y npm.
- Un proyecto Supabase.

## Ejecutar en desarrollo

```bash
npm install
Copy-Item .env.example .env
```

Edita `.env` y pega la Project URL y la clave **Publishable** de Supabase. Luego:

```bash
npm run dev
```

## Crear la base de datos

En Supabase abre **SQL Editor**, ejecuta `supabase/schema.sql` y espera el mensaje de finalización. El esquema crea las tablas, índices, funciones de venta/cierre y políticas Row Level Security. Cada operación que cambia inventario se registra; la venta de productos descuenta unidades en la misma transacción.

En **Authentication → URL Configuration**, configura la URL de producción como Site URL y Redirect URL. Crea una cuenta desde el formulario inicial; después de confirmar el correo vuelve a iniciar sesión. Al primer acceso se crea el espacio y los servicios básicos.

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta al repositorio, manteniendo la carpeta `.github/workflows`.
2. En GitHub, abre **Settings → Secrets and variables → Actions → Variables** y agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. En **Settings → Pages**, selecciona **GitHub Actions** como origen.
4. Envía el código a la rama `main`. El workflow instala dependencias, compila Vite y publica `dist`.
5. Registra la URL publicada en Supabase Authentication → URL Configuration.

La clave Publishable está diseñada para el navegador y se protege con RLS. Nunca pongas `sb_secret_...` o `service_role` en `.env` del frontend ni en GitHub Pages. El modo demo utiliza datos ficticios y no escribe a Supabase.

## Alcance actual

Los roles de propietario, administrador y barbero están definidos en el esquema. La interfaz usa la cuenta autenticada y crea una barbería para el primer usuario; la pantalla para invitar y administrar empleados se debe agregar antes de dar acceso a más personal. El resumen y las tablas están implementados; el esquema permite extender citas, nómina y auditoría sin guardar todo el negocio como un único bloque JSON.
