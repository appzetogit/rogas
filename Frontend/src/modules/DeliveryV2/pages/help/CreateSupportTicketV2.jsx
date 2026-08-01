import React, { useState } from 'react';
import { ArrowLeft, Loader2, Send, Camera, X } from 'lucide-react';
import { deliveryAPI, uploadAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

/**
 * CreateSupportTicketV2 - Restored Old UI for Ticket Creation.
 */
export const CreateSupportTicketV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    description: "",
    category: "other",
    priority: "medium",
    image: ""
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      return toast.error("File size exceeds 2MB limit");
    }

    setUploading(true);
    try {
      const res = await uploadAPI.uploadMedia(file, { folder: 'appzeto/delivery/tickets' });
      const url = res.data?.data?.url || res.data?.url || res.data?.data?.imageUrl;
      if (url) {
        setForm(prev => ({ ...prev, image: url }));
        toast.success("Screenshot uploaded successfully");
      } else {
        throw new Error("Failed to get image URL");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (form.subject.length < 3) return toast.error("Subject too short (min 3 characters)");
    if (form.description.length < 10) return toast.error("Description too short (min 10 characters)");

    setLoading(true);
    try {
      const response = await deliveryAPI.createSupportTicket(form);
      if (response?.data?.success) {
        toast.success("Ticket raised successfully");
        goBack();
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to create ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-poppins">
      {/* Header */}
      <div className="bg-white px-4 py-5 flex items-center gap-4 sticky top-0 w-full z-50 shadow-sm border-b border-gray-100">
        <button onClick={goBack} className="p-1 hover:bg-[#F5F5F0] rounded-full transition-colors">
           <ArrowLeft className="w-6 h-6 text-[#2B2B2B]" />
        </button>
        <h1 className="text-xl font-black text-[#2B2B2B] uppercase tracking-tight">Raise Ticket</h1>
      </div>

      <div className="pt-24 px-4 pb-10 space-y-8">
         <div className="space-y-6">
            {/* Subject */}
            <div className="space-y-2">
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Issue Topic</label>
               <input 
                 type="text"
                 placeholder="Main subject of your concern"
                 value={form.subject}
                 onChange={(e) => setForm({...form, subject: e.target.value})}
                 className="w-full bg-[#F5F5F0] border border-gray-200 rounded-2xl px-5 py-4 text-sm font-bold text-[#2B2B2B] focus:ring-4 focus:ring-[#1F7A63]/10 focus:border-[#1F7A63] transition-all outline-none"
               />
            </div>

            {/* Description */}
            <div className="space-y-2">
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Detail Description</label>
               <textarea 
                 rows={6}
                 placeholder="Explain your issue here..."
                 value={form.description}
                 onChange={(e) => setForm({...form, description: e.target.value})}
                 className="w-full bg-[#F5F5F0] border border-gray-200 rounded-2xl px-5 py-4 text-sm font-bold text-[#2B2B2B] focus:ring-4 focus:ring-[#1F7A63]/10 focus:border-[#1F7A63] transition-all outline-none resize-none"
               />
            </div>

            {/* Photo Attachment Section */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Attach Screenshot (Optional)</label>
              <div className="flex items-center gap-4">
                {form.image ? (
                  <div className="relative w-24 h-24 rounded-2xl overflow-hidden border border-gray-200">
                    <img 
                      src={form.image} 
                      alt="Attachment Preview" 
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, image: "" })}
                      className="absolute top-1.5 right-1.5 bg-[#2B2B2B]/80 text-[#F5F5F0] p-1 rounded-full hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="w-24 h-24 rounded-2xl border border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer bg-[#F5F5F0] hover:bg-gray-100 hover:border-[#1F7A63] transition-all">
                    {uploading ? (
                      <Loader2 className="w-6 h-6 animate-spin text-[#1F7A63]" />
                    ) : (
                      <>
                        <Camera className="w-6 h-6 text-gray-400" />
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Upload</span>
                      </>
                    )}
                    <input 
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploading || loading}
                      className="hidden"
                    />
                  </label>
                )}
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider space-y-1">
                  <p>PNG, JPG, JPEG supported</p>
                  <p>Max file size: 2MB</p>
                </div>
              </div>
            </div>

            {/* Category & Priority */}
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category</label>
                  <select 
                    value={form.category}
                    onChange={(e) => setForm({...form, category: e.target.value})}
                    className="w-full bg-[#F5F5F0] border border-gray-200 rounded-2xl px-5 py-4 text-xs font-black text-gray-800 uppercase tracking-widest outline-none focus:border-[#1F7A63]"
                  >
                     <option value="payment">Payment</option>
                     <option value="order">Order</option>
                     <option value="account">Account</option>
                     <option value="technical">Tech Issue</option>
                     <option value="other">Other</option>
                  </select>
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Priority</label>
                  <select 
                    value={form.priority}
                    onChange={(e) => setForm({...form, priority: e.target.value})}
                    className="w-full bg-[#F5F5F0] border border-gray-200 rounded-2xl px-5 py-4 text-xs font-black text-gray-800 uppercase tracking-widest outline-none focus:border-[#1F7A63]"
                  >
                     <option value="low">Low</option>
                     <option value="medium">Medium</option>
                     <option value="high">High</option>
                     <option value="urgent">Urgent</option>
                  </select>
               </div>
            </div>
         </div>

         <button 
           onClick={handleSubmit}
           disabled={loading || uploading}
           className="w-full bg-[#1F7A63] hover:bg-[#18604d] text-white p-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
         >
           {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
           Submit Ticket
         </button>
      </div>
    </div>
  );
};
