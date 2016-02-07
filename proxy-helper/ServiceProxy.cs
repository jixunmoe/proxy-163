using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Threading;

namespace proxy_helper
{
    partial class ServiceProxy : ServiceBase
    {
        private EventLog eventLog1;
        static private string eventSrc = "Proxy-163";
        static private string eventLog = "INFO";

        internal API.PROCESS_INFORMATION pi;

        public void ThreadRunner()
        {
            var dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            API.SECURITY_ATTRIBUTES processAttr = new API.SECURITY_ATTRIBUTES();
            API.SECURITY_ATTRIBUTES threadAttr = new API.SECURITY_ATTRIBUTES();
            API.STARTUPINFO si = new API.STARTUPINFO();
            API.PROCESS_INFORMATION pi = new API.PROCESS_INFORMATION();
            processAttr.nLength = Marshal.SizeOf(processAttr);
            threadAttr.nLength = Marshal.SizeOf(threadAttr);
            
            // NORMAL_PRIORITY_CLASS: 0x0020
            var bSuccess = API.CreateProcess(Environment.GetEnvironmentVariable("ComSpec"), "/c \"" + dir + "\\boot.cmd\"",
                ref processAttr, ref threadAttr, false, 0x0020, IntPtr.Zero, dir, ref si, out pi);
            
            this.pi = pi;
            eventLog1.WriteEntry(String.Format("Process id: {0}", pi.dwProcessId));
            if (!bSuccess)
            {
                this.Stop();
            }
        }

        public ServiceProxy()
        {
            InitializeComponent();
            eventLog1 = new EventLog();
            if (!EventLog.SourceExists(eventSrc))
            {
                EventLog.CreateEventSource(eventSrc, eventLog);
            }

            eventLog1.Source = eventSrc;
            eventLog1.Log = eventLog;
        }

        Thread oThread;
        System.Timers.Timer timer;
        protected override void OnStart(string[] args)
        {
            // TODO: Add code here to start your service.
            eventLog1.WriteEntry("Launch.");
            oThread = new Thread(new ThreadStart(ThreadRunner));
            oThread.Start();

            timer = new System.Timers.Timer();
            timer.Interval = 60000;
            timer.Elapsed += onTimer;
            timer.Start();
        }

        private void onTimer(object sender, System.Timers.ElapsedEventArgs e)
        {
            uint editCode;
            API.GetExitCodeProcess(pi.hProcess, out editCode);
            if (editCode != 259 /* STILL_ACTIVE */)
            {
                if (oThread.IsAlive)
                    oThread.Abort();

                oThread.Start();
                eventLog1.WriteEntry("Restart proxy.");
            }
        }

        protected override void OnStop()
        {
            timer.Stop();
            API.TerminateProcess(pi.hProcess, 0);
            eventLog1.WriteEntry("Shutdown proxy.");
        }
    }
}
