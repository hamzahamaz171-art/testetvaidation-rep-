-- Fix: Insert new auth.users into public.users WITHOUT forcing UUID into bigint
-- This prevents "Database error saving new user" during signup.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (
    first_name,
    last_name,
    email,
    role
  )
  values (
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.email,
    'operator'
  )
  on conflict (email) do nothing;

  return new;

exception when others then
  -- Never block signup if public.users insert fails
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
