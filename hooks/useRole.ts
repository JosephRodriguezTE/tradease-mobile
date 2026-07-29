import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export type UserRole = 'customer' | 'contractor' | null;

export interface EmployeeRecord {
  id: string;
  contractor_id: string;
  user_id: string;
  full_name: string;
  role: string;
  status: string;
  can_accept_jobs: boolean;
  can_message_customers: boolean;
  can_view_analytics: boolean;
  can_manage_employees: boolean;
  can_edit_profile: boolean;
  jobs_completed: number;
  last_active_at: string | null;
}

export function useRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const [isEmployee, setIsEmployee] = useState(false);
  const [employeeRecord, setEmployeeRecord] = useState<EmployeeRecord | null>(null);
  const [employerContractorId, setEmployerContractorId] = useState<string | null>(null);

  useEffect(() => {
    // Don't resolve role until auth has settled
    if (authLoading) return;

    if (!user) {
      setRole(null);
      setIsEmployee(false);
      setEmployeeRecord(null);
      setEmployerContractorId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const checkRole = async () => {
      // 1. Check if user owns a contractor account
      const { data: contractorData } = await supabase
        .from('contractors')
        .select('id')
        .eq('id', user.id)
        .single();

      if (contractorData) {
        setRole('contractor');
        setIsEmployee(false);
        setEmployeeRecord(null);
        setEmployerContractorId(null);
        setLoading(false);
        return;
      }

      // 2. Check if user is an active employee under a contractor
      const { data: empData } = await supabase
        .from('contractor_employees')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (empData) {
        // Employees see the contractor dashboard
        setRole('contractor');
        setIsEmployee(true);
        setEmployeeRecord(empData as EmployeeRecord);
        setEmployerContractorId(empData.contractor_id);
        setLoading(false);
        return;
      }

      // 3. Check if user is a customer
      const { data: customerData } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (customerData) {
        setRole('customer');
        setIsEmployee(false);
        setEmployeeRecord(null);
        setEmployerContractorId(null);
        setLoading(false);
        return;
      }

      // 4. Last resort: auth metadata
      const metaRole = user.user_metadata?.role as UserRole;
      setRole(metaRole ?? null);
      setIsEmployee(false);
      setEmployeeRecord(null);
      setEmployerContractorId(null);
      setLoading(false);
    };

    checkRole();
  }, [user, authLoading]);

  const isContractor = role === 'contractor';
  const isCustomer = role === 'customer';
  const isOwner = isContractor && !isEmployee;

  return {
    role, loading,
    isContractor, isCustomer,
    isEmployee, isOwner,
    employeeRecord, employerContractorId,
  };
}
