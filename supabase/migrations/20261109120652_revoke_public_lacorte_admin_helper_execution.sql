-- Keep the administrator authorization helper private.
-- RLS policies use private.is_lacorte_admin(); the public wrapper is not
-- called by the frontend and must not be exposed as a SECURITY DEFINER RPC.
REVOKE ALL ON FUNCTION public.is_lacorte_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_lacorte_admin() FROM anon;
REVOKE ALL ON FUNCTION public.is_lacorte_admin() FROM authenticated;
