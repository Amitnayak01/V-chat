import { Phone, PhoneOff } from 'lucide-react';

const IncomingCall = ({ caller, onAccept, onReject }) => {
  if (!caller) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-fade-in p-0 sm:p-4">
      <div className="card p-6 sm:p-8 w-full sm:max-w-md rounded-t-2xl sm:rounded-xl animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Caller Info */}
        <div className="text-center mb-6">
          <div className="relative inline-block mb-4">
            <img 
              src={caller.callerAvatar} 
              alt={caller.callerName}
              className="w-20 h-20 sm:w-24 sm:h-24 avatar"
            />
            <div className="absolute inset-0 rounded-full border-4 border-primary-500 animate-ping"></div>
          </div>
          
          <h2 className="text-xl sm:text-2xl font-display font-bold text-slate-900 mb-2">
            {caller.callerName}
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Incoming video call...
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 sm:gap-4">
          <button
            onClick={onReject}
            className="flex-1 btn btn-danger flex items-center justify-center space-x-2 py-3 sm:py-4 text-sm sm:text-base"
          >
            <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Decline</span>
          </button>
          
          <button
            onClick={onAccept}
            className="flex-1 btn btn-success flex items-center justify-center space-x-2 py-3 sm:py-4 text-sm sm:text-base"
          >
            <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Accept</span>
          </button>
        </div>

        {/* Ringing Indicator */}
        <div className="mt-4 flex items-center justify-center space-x-2">
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>
    </div>
  );
};

export default IncomingCall;
