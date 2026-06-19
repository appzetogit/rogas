import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  ArrowLeft, Clock, CheckCircle, XCircle, 
  Loader2, MessageSquare, ShieldCheck, Mail 
} from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';
import { useDeliveryNotificationContext } from '../../../Food/context/DeliveryNotificationContext';

/**
 * ViewSupportTicketV2 - Restored Old UI for Ticket Details.
 */
export const ViewSupportTicketV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useDeliveryNotificationContext();

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getSupportTicketById(ticketId);
        if (response?.data?.success) {
          const found =
            response?.data?.data?.ticket ||
            response?.data?.data ||
            response?.data?.ticket ||
            null;
          setTicket(found);
        }
      } catch (error) {
        toast.error("Failed to load ticket details");
      } finally {
        setLoading(false);
      }
    };
    fetchTicket();
  }, [ticketId]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = (updated) => {
      if (updated.complaintId === ticketId) {
        setTicket(prev => prev ? {
          ...prev,
          status: updated.status,
          adminResponse: updated.adminResponse,
          respondedAt: updated.respondedAt,
          updatedAt: updated.updatedAt
        } : null);
        toast.info("Ticket status updated by Admin");
      }
    };
    socket.on('complaint_status_updated', handleUpdate);
    return () => {
      socket.off('complaint_status_updated', handleUpdate);
    };
  }, [socket, ticketId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-8 h-8 animate-spin text-[#1F7A63]" /></div>;
  if (!ticket) return <div className="p-20 text-center text-gray-400 font-bold uppercase tracking-widest h-screen">Ticket Not Found</div>;

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "open": return "text-orange-600 bg-orange-50 border-orange-100";
      case "resolved": return "text-green-600 bg-green-50 border-green-100";
      case "closed": return "text-gray-600 bg-gray-50 border-gray-100";
      default: return "text-[#1F7A63] bg-[#F5F5F0] border-[#1F7A63]/20";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-20">
      {/* Header */}
      <div className="bg-white px-4 py-5 flex items-center gap-4 fixed top-0 w-full z-50 shadow-sm border-b border-gray-100">
        <button onClick={goBack} className="p-1 hover:bg-[#F5F5F0] rounded-full transition-colors">
           <ArrowLeft className="w-6 h-6 text-[#2B2B2B]" />
        </button>
        <h1 className="text-xl font-black text-[#2B2B2B] uppercase tracking-tight">Ticket Info</h1>
      </div>

      <div className="pt-24 px-4 space-y-6">
         {/* Status & ID */}
         <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="space-y-1">
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ID Reference</p>
               <h3 className="text-lg font-black text-[#2B2B2B]">#{ticket.ticketId || "Pending"}</h3>
            </div>
            <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${getStatusColor(ticket.status)}`}>
               {ticket.status?.replace('_', ' ')}
            </div>
         </div>

         {/* Subject & Description */}
         <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="space-y-1">
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subject</p>
               <h4 className="text-sm font-black text-[#2B2B2B]">{ticket.subject}</h4>
            </div>
            <div className="space-y-1 pt-4 border-t border-gray-100">
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Detail Description</p>
               <p className="text-xs text-gray-600 font-medium leading-relaxed">{ticket.description}</p>
            </div>
         </div>

         {/* Screenshots/Attachments */}
         {ticket.proofPhotos && ticket.proofPhotos.length > 0 && (
           <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-3">
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Attached Screenshot</p>
             <div className="flex flex-wrap gap-3 pt-1">
               {ticket.proofPhotos.map((photo, index) => (
                 <a 
                   key={index} 
                   href={photo} 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="relative w-24 h-24 rounded-2xl overflow-hidden border border-gray-200 block hover:opacity-90 transition-opacity"
                 >
                   <img 
                     src={photo} 
                     alt={`Screenshot ${index + 1}`}
                     className="w-full h-full object-cover"
                   />
                 </a>
               ))}
             </div>
           </div>
         )}

         {/* Response Section */}
         <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#1F7A63]/20 flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-[#F5F5F0] flex items-center justify-center shrink-0">
               <ShieldCheck className="w-5 h-5 text-[#1F7A63]" />
            </div>
            <div className="space-y-2">
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Support Response</p>
               {ticket.adminResponse ? (
                 <p className="text-xs text-[#2B2B2B] font-bold leading-relaxed">
                   {ticket.adminResponse}
                 </p>
               ) : (
                 <p className="text-xs text-[#2B2B2B]/60 font-bold leading-relaxed italic">
                   Our support team is currently reviewing your ticket. You'll receive a notification once there is an update.
                 </p>
               )}
               {ticket.respondedAt && (
                 <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                   Updated {new Date(ticket.respondedAt).toLocaleString()}
                 </p>
               )}
            </div>
         </div>

         <div className="mt-10 flex flex-col items-center justify-center opacity-20 gap-4">
            <Mail className="w-12 h-12 text-[#2B2B2B]" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-center text-[#2B2B2B]">AppZeto Support Fleet</p>
         </div>
      </div>
    </div>
  );
};
