import { useState, useEffect, useCallback } from "react";
import { UserPlus, Shield, Eye, EyeOff, X, Check } from "lucide-react";
import { adminClient } from "@food/api/axios";
import { Can } from "@food/hooks/usePermissions";

const PRD_ROLES = [
  { value: "SUPER_ADMIN",       label: "Super Admin",       color: "#ef4444", description: "Full system access - all permissions" },
  { value: "ACCOUNTANT",        label: "Accountant",        color: "#22c55e", description: "Finance, payouts, VAT reports (PLN)" },
  { value: "CUSTOMER_SERVICE",  label: "Customer Service",  color: "#3b82f6", description: "Support, complaints, refunds (max PLN 150)" },
  { value: "CITY_MANAGER",      label: "City Manager",      color: "#f59e0b", description: "Operations in assigned city" },
  { value: "MARKETING_MANAGER", label: "Marketing Manager", color: "#a855f7", description: "Campaigns, banners, coupons" },
  { value: "WEB_MANAGER",       label: "Web Manager",       color: "#06b6d4", description: "Content, legal pages, OTA config" },
  { value: "FLEET_MANAGER",     label: "Fleet Manager",     color: "#f97316", description: "Fleet partners, driver docs, invoices" },
];

const ROLE_PERMISSIONS = {
  SUPER_ADMIN:       ["*"],
  ACCOUNTANT:        ["finance.read", "finance.payouts.manage", "fleet.invoices.manage", "reports.finance.export"],
  CUSTOMER_SERVICE:  ["customers.read", "orders.read", "complaints.manage", "refunds.issue_limited"],
  CITY_MANAGER:      ["operations.map.read", "vendors.city.manage", "drivers.city.manage", "zones.manage"],
  MARKETING_MANAGER: ["campaigns.manage", "banners.manage", "coupons.manage", "loyalty.manage"],
  WEB_MANAGER:       ["content.faq.manage", "content.legal.manage", "content.emailTemplates.manage"],
  FLEET_MANAGER:     ["fleet.partners.manage", "fleet.documents.review", "fleet.invoices.review"],
};

export default function EmployeeRole() {
  const [selectedRole, setSelectedRole] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [cities, setCities] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", confirmPassword: "",
    adminRole: "CUSTOMER_SERVICE", roleId: "", assignedCityIds: []
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminClient.get("/food/admin/roles/users");
      if (res?.data?.success) setAdmins(res.data.data.admins || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const loadCities = useCallback(async () => {
    try {
      const res = await adminClient.get("/food/admin/cities");
      if (res?.data?.success) setCities(res.data.data.cities || []);
    } catch (e) {}
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const res = await adminClient.get("/food/admin/custom-roles");
      if (res?.data?.success) setRoles(res.data.data.roles || []);
    } catch (e) {}
  }, []);

  useEffect(() => {
    loadAdmins(); loadCities(); loadRoles();
  }, [loadAdmins, loadCities, loadRoles]);

  const handleCreate = async () => {
    setError(""); setSuccess("");
    if (!form.name || !form.email || !form.password) { setError("Name, email and password are required"); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords do not match"); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      const res = await adminClient.post("/food/admin/employees", {
        name: form.name, email: form.email, phone: form.phone,
        password: form.password, 
        adminRole: form.adminRole || undefined,
        roleId: form.roleId || undefined,
        assignedCityIds: form.assignedCityIds,
      });
      if (res?.data?.success) {
        setSuccess("Employee created successfully");
        setAdmins(prev => [res.data.data.admin, ...prev]);
        setShowCreateForm(false);
        setForm({ name: "", email: "", phone: "", password: "", confirmPassword: "", adminRole: "CUSTOMER_SERVICE", roleId: "", assignedCityIds: [] });
      }
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to create employee");
    } finally { setSaving(false); }
  };

  const toggleActive = async (admin) => {
    try {
      if (admin.isActive) {
        await adminClient.delete("/food/admin/employees/" + admin._id);
        setAdmins(prev => prev.map(a => a._id === admin._id ? { ...a, isActive: false } : a));
      } else {
        const res = await adminClient.patch("/food/admin/employees/" + admin._id, { isActive: true });
        if (res?.data?.success) setAdmins(prev => prev.map(a => a._id === admin._id ? res.data.data.admin : a));
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Roles and Employees</h1>
              <p className="text-sm text-gray-400">7 PRD-defined roles with RBAC</p>
            </div>
          </div>
          <Can module="rolesEmployees" action="create">
            <button onClick={() => { setShowCreateForm(true); setError(""); setSuccess(""); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500 text-sm">
              <UserPlus className="w-4 h-4" /> Create Employee
            </button>
          </Can>
        </div>
      </div>

      <div className="px-6 py-6">
        <div>
            {showCreateForm && (
              <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-indigo-400" /> Create New Employee
                  </h3>
                  <button onClick={() => setShowCreateForm(false)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                {error && <div className="mb-3 p-3 rounded-xl bg-red-900/40 border border-red-700/50 text-sm text-red-300">{error}</div>}
                {success && <div className="mb-3 p-3 rounded-xl bg-green-900/40 border border-green-700/50 text-sm text-green-300">{success}</div>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: "name",  label: "Full Name",        type: "text",  ph: "John Smith" },
                    { key: "email", label: "Email Address",    type: "email", ph: "john@example.com" },
                    { key: "phone", label: "Phone (optional)", type: "text",  ph: "+48 500 000 000" },
                  ].map(({ key, label, type, ph }) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-400 mb-1">{label}</label>
                      <input type={type} value={form[key]} onChange={e => setF(key, e.target.value)} placeholder={ph}
                        className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Password</label>
                    <div className="relative">
                      <input type={showPassword ? "text" : "password"} value={form.password}
                        onChange={e => setF("password", e.target.value)} placeholder="Min 8 characters"
                        className="w-full px-3 py-2.5 pr-10 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600" />
                      <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Confirm Password</label>
                    <input type="password" value={form.confirmPassword} onChange={e => setF("confirmPassword", e.target.value)}
                      placeholder="Repeat password"
                      className="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-400 mb-2">Assign Role</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {PRD_ROLES.map(role => (
                        <button key={role.value} type="button" onClick={() => { setF("adminRole", role.value); setF("roleId", ""); }}
                          className={"p-2.5 rounded-xl border text-xs font-bold text-left transition " +
                            (form.adminRole === role.value && !form.roleId ? "border-indigo-500 text-white" : "border-gray-700 text-gray-400 hover:border-gray-600")}
                          style={form.adminRole === role.value && !form.roleId ? { background: role.color + "22", borderColor: role.color } : {}}>
                          <div className="w-2 h-2 rounded-full mb-1.5" style={{ background: role.color }} />
                          {role.label} (Legacy PRD)
                        </button>
                      ))}
                      {roles.map(role => (
                        <button key={role._id} type="button" onClick={() => { setF("roleId", role._id); setF("adminRole", ""); }}
                          className={"p-2.5 rounded-xl border text-xs font-bold text-left transition " +
                            (form.roleId === role._id ? "border-orange-500 text-white" : "border-gray-700 text-gray-400 hover:border-gray-600")}
                          style={form.roleId === role._id ? { background: "#f9731622", borderColor: "#f97316" } : {}}>
                          <div className="w-2 h-2 rounded-full mb-1.5" style={{ background: "#f97316" }} />
                          {role.name} (Custom)
                        </button>
                      ))}
                    </div>
                  </div>
                  {["CITY_MANAGER", "FLEET_MANAGER"].includes(form.adminRole) && cities.length > 0 && (
                    <div className="md:col-span-2">
                      <label className="block text-xs text-gray-400 mb-2">Assigned Cities (optional)</label>
                      <div className="flex flex-wrap gap-2">
                        {cities.map(city => {
                          const sel = form.assignedCityIds.includes(city._id);
                          return (
                            <button key={city._id} type="button"
                              onClick={() => setF("assignedCityIds", sel ? form.assignedCityIds.filter(id => id !== city._id) : [...form.assignedCityIds, city._id])}
                              className={"px-3 py-1.5 rounded-xl text-xs font-semibold transition " + (sel ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700")}>
                              {city.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={() => setShowCreateForm(false)} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 font-semibold">Cancel</button>
                  <button onClick={handleCreate} disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 font-bold disabled:opacity-50">
                    {saving ? "Creating..." : "Create Employee"}
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
              </div>
            ) : admins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <UserPlus className="w-12 h-12 mb-3" />
                <p className="font-semibold">No employees yet</p>
                <button onClick={() => setShowCreateForm(true)} className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Create First Employee</button>
              </div>
            ) : (
              <div className="space-y-3">
                {admins.map(admin => {
                  const roleObj = PRD_ROLES.find(r => r.value === admin.adminRole);
                  return (
                    <div key={admin._id} className="bg-gray-900 rounded-2xl border border-gray-800 p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ background: (roleObj?.color || "#374151") + "33", color: roleObj?.color || "#9ca3af" }}>
                        {(admin.name || admin.email || "A").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-bold text-white truncate">{admin.name || "Unnamed"}</p>
                          {admin.roleId ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500/20 text-orange-500 border border-orange-500/30">
                              {admin.roleId?.name || 'Custom Role'}
                            </span>
                          ) : roleObj ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: roleObj.color + "22", color: roleObj.color }}>
                              {roleObj.label} (Legacy)
                            </span>
                          ) : null}
                          {!admin.isActive && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-500">Inactive</span>}
                        </div>
                        <p className="text-sm text-gray-400 truncate">{admin.email}</p>
                        {admin.phone && <p className="text-xs text-gray-500">{admin.phone}</p>}
                        {(admin.assignedCityIds || []).length > 0 && (
                          <p className="text-xs text-indigo-400 mt-0.5">Cities: {admin.assignedCityIds.map(c => c?.name || c).join(", ")}</p>
                        )}
                      </div>
                      <Can module="rolesEmployees" action="edit">
                        <button onClick={() => toggleActive(admin)}
                          className={"px-3 py-1.5 rounded-xl text-xs font-bold transition " +
                            (admin.isActive ? "bg-red-900/50 text-red-300 hover:bg-red-900" : "bg-green-900/50 text-green-300 hover:bg-green-900")}>
                          {admin.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </Can>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}