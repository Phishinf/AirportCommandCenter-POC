import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Activity, 
  AlertTriangle, 
  MessageSquare, 
  Settings, 
  Users, 
  Clock, 
  TrendingUp, 
  Shield, 
  Zap,
  ChevronRight,
  Search,
  Maximize2,
  Terminal,
  Plane
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import * as THREE from 'three';
import { nexusChat } from './services/geminiService';
import { cn } from './lib/utils';
import Markdown from 'react-markdown';

// --- Types ---
interface FlowMetric {
  zone: string;
  count: number;
  waitTime: number;
  timestamp: string;
}

interface Alert {
  id?: number;
  agent: string;
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
}

// --- Constants ---
const zones = ["Security T1", "Check-in A", "Gate B12", "Immigration", "Retail Plaza"];

// --- Components ---

const Heatmap3D = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    // Create a simplified airport terminal floor
    const geometry = new THREE.PlaneGeometry(10, 10, 20, 20);
    const material = new THREE.MeshPhongMaterial({ 
      color: 0x1e1e2e, 
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);

    // Add some "heat" points
    const points: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const sphereGeom = new THREE.SphereGeometry(0.5, 32, 32);
      const sphereMat = new THREE.MeshPhongMaterial({ 
        color: 0x3b82f6, 
        emissive: 0x3b82f6,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.6
      });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      sphere.position.set(Math.random() * 8 - 4, 0.5, Math.random() * 8 - 4);
      scene.add(sphere);
      points.push(sphere);
    }

    const light = new THREE.PointLight(0xffffff, 1, 100);
    light.position.set(0, 10, 0);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040));

    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);

    const animate = () => {
      requestAnimationFrame(animate);
      points.forEach(p => {
        p.scale.setScalar(1 + Math.sin(Date.now() * 0.002) * 0.2);
      });
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (containerRef.current) containerRef.current.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default function App() {
  const [metrics, setMetrics] = useState<FlowMetric[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const s = io();
    setSocket(s);

    s.on('flow_update', (data: FlowMetric) => {
      setMetrics(prev => [data, ...prev].slice(0, 50));
    });

    s.on('new_alert', (data: Alert) => {
      setAlerts(prev => [data, ...prev].slice(0, 20));
    });

    // Initial fetch
    fetch('/api/alerts').then(res => res.json()).then(setAlerts);
    fetch('/api/metrics').then(res => res.json()).then(setMetrics);

    return () => { s.disconnect(); };
  }, []);

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: msg }]);
    setIsTyping(true);

    try {
      const context = {
        currentMetrics: metrics.slice(0, 5),
        activeAlerts: alerts.filter(a => a.severity === 'high'),
        timestamp: new Date().toISOString()
      };
      const response = await nexusChat(msg, context);
      setChatHistory(prev => [...prev, { role: 'ai', text: response || 'No response from Nexus Core.' }]);
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'ai', text: 'Error connecting to Nexus Core.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const latestWaitTimes = zones.map(z => {
    const m = metrics.find(metric => metric.zone === z);
    return { name: z, value: m ? m.waitTime : 0 };
  });

  return (
    <div className="flex h-screen w-screen bg-[#0a0a0b] text-white overflow-hidden grid-bg">
      {/* Sidebar */}
      <aside className="w-16 flex flex-col items-center py-6 border-r border-[#27272a] bg-[#0d0d0f] z-20">
        <div className="mb-10 p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20">
          <Plane className="w-6 h-6 text-white" />
        </div>
        <nav className="flex flex-col gap-8">
          <SidebarIcon icon={<LayoutDashboard className="w-5 h-5" />} active />
          <SidebarIcon icon={<Activity className="w-5 h-5" />} />
          <SidebarIcon icon={<Users className="w-5 h-5" />} />
          <SidebarIcon icon={<Shield className="w-5 h-5" />} />
          <SidebarIcon icon={<Settings className="w-5 h-5" />} />
        </nav>
        <div className="mt-auto">
          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold">
            JD
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-[#27272a] flex items-center justify-between px-8 bg-[#0d0d0f]/50 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold tracking-tight">NEXUS COMMAND CENTER</h1>
            <div className="h-4 w-[1px] bg-zinc-800" />
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              SYSTEMS NOMINAL
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-md border border-zinc-800">
              <Search className="w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Search zones..." 
                className="bg-transparent border-none outline-none text-xs w-48"
              />
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
              <div className="flex flex-col items-end">
                <span className="text-white">23:45:02</span>
                <span>UTC+8</span>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="flex-1 p-6 grid grid-cols-12 grid-rows-6 gap-6 overflow-hidden">
          
          {/* Real-time Flow Heatmap */}
          <section className="col-span-8 row-span-4 glass rounded-xl overflow-hidden relative group">
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
              <div className="px-3 py-1 bg-black/50 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-bold tracking-widest uppercase flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Live Spatial Density
              </div>
            </div>
            <div className="absolute top-4 right-4 z-10">
              <button className="p-2 bg-black/50 backdrop-blur-md border border-white/10 rounded-lg hover:bg-white/10 transition-colors">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
            <Heatmap3D />
            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
              <div className="glass p-3 rounded-lg flex flex-col gap-1 pointer-events-auto">
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Peak Zone</span>
                <span className="text-sm font-semibold">Security Terminal 1</span>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1 w-24 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 w-3/4" />
                  </div>
                  <span className="text-[10px] font-mono">75%</span>
                </div>
              </div>
              <div className="flex gap-2 pointer-events-auto">
                <div className="glass px-4 py-2 rounded-lg flex flex-col items-center">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">Total Pax</span>
                  <span className="text-lg font-mono font-bold">1,284</span>
                </div>
                <div className="glass px-4 py-2 rounded-lg flex flex-col items-center">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">Avg Wait</span>
                  <span className="text-lg font-mono font-bold text-orange-400">12m</span>
                </div>
              </div>
            </div>
          </section>

          {/* Predictive Analytics */}
          <section className="col-span-4 row-span-3 glass rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold tracking-widest uppercase text-zinc-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                Prophet: Flow Forecast
              </h3>
              <span className="text-[10px] font-mono text-zinc-500">T + 60m</span>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.slice(0, 20).reverse()}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="timestamp" hide />
                  <YAxis hide domain={[0, 'auto']} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#151518', border: '1px solid #27272a', fontSize: '12px' }}
                    itemStyle={{ color: '#3b82f6' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="passenger_count" 
                    stroke="#3b82f6" 
                    fillOpacity={1} 
                    fill="url(#colorCount)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Confidence</div>
                <div className="text-sm font-mono">94.2%</div>
              </div>
              <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
                <div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Model</div>
                <div className="text-sm font-mono">LSTM-V4</div>
              </div>
            </div>
          </section>

          {/* Alerts & Anomalies */}
          <section className="col-span-4 row-span-3 glass rounded-xl p-5 flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold tracking-widest uppercase text-zinc-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Sentinel: Active Alerts
              </h3>
              <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 text-[10px] font-bold rounded border border-orange-500/20">
                {alerts.length} ACTIVE
              </span>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-2">
              <AnimatePresence mode="popLayout">
                {alerts.map((alert, i) => (
                  <motion.div 
                    key={alert.id || i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      "p-3 rounded-lg border flex flex-col gap-1",
                      alert.severity === 'high' ? "bg-red-500/5 border-red-500/20" : "bg-zinc-900/50 border-zinc-800"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-[10px] font-bold uppercase",
                        alert.severity === 'high' ? "text-red-400" : "text-zinc-400"
                      )}>
                        {alert.type}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">{alert.message}</p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* Queue Wait Times */}
          <section className="col-span-8 row-span-2 glass rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold tracking-widest uppercase text-zinc-400 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500" />
                Processing Efficiency
              </h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <div className="w-2 h-2 rounded-sm bg-blue-500" />
                  WAIT TIME (MIN)
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={latestWaitTimes} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={100} 
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fill: '#a1a1aa', fontSize: 10, fontWeight: 'bold' }}
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#151518', border: '1px solid #27272a', fontSize: '12px' }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                    {latestWaitTimes.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.value > 20 ? '#f87171' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

        </div>
      </main>

      {/* AI Dispatcher Chat Overlay */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-8 w-96 h-[500px] glass rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50"
          >
            <div className="p-4 border-b border-[#27272a] bg-[#0d0d0f] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                  <Terminal className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider">Dispatcher Agent</h4>
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Operational Support Active
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setChatOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <ChevronRight className="w-5 h-5 rotate-90" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {chatHistory.length === 0 && (
                <div className="text-center py-10">
                  <MessageSquare className="w-10 h-10 text-zinc-800 mx-auto mb-3" />
                  <p className="text-xs text-zinc-500">Ask me about flow predictions or resource allocation.</p>
                </div>
              )}
              {chatHistory.map((chat, i) => (
                <div key={i} className={cn(
                  "flex flex-col gap-1 max-w-[85%]",
                  chat.role === 'user' ? "self-end items-end" : "self-start items-start"
                )}>
                  <div className={cn(
                    "px-3 py-2 rounded-xl text-xs leading-relaxed",
                    chat.role === 'user' ? "bg-blue-600 text-white" : "bg-zinc-900 border border-zinc-800 text-zinc-300"
                  )}>
                    <Markdown>{chat.text}</Markdown>
                  </div>
                  <span className="text-[9px] text-zinc-600 font-mono uppercase">
                    {chat.role === 'user' ? 'Operator' : 'Nexus AI'}
                  </span>
                </div>
              ))}
              {isTyping && (
                <div className="self-start bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-xl">
                  <div className="flex gap-1">
                    <div className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce" />
                    <div className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1 h-1 bg-zinc-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#27272a] bg-[#0d0d0f]/50">
              <div className="relative">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Query Nexus Core..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-xs outline-none focus:border-blue-500 transition-colors pr-10"
                />
                <button 
                  onClick={handleSendMessage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-500 hover:text-blue-400 transition-colors"
                >
                  <Zap className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Chat Trigger */}
      <button 
        onClick={() => setChatOpen(!chatOpen)}
        className={cn(
          "fixed bottom-8 right-8 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 z-50",
          chatOpen ? "bg-zinc-800 rotate-90" : "bg-blue-600 hover:bg-blue-500"
        )}
      >
        {chatOpen ? <ChevronRight className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </button>
    </div>
  );
}

function SidebarIcon({ icon, active = false }: { icon: React.ReactNode, active?: boolean }) {
  return (
    <button className={cn(
      "p-2.5 rounded-xl transition-all duration-200 relative group",
      active ? "bg-blue-600/10 text-blue-500" : "text-zinc-500 hover:text-white hover:bg-zinc-900"
    )}>
      {icon}
      {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r-full" />}
      <div className="absolute left-full ml-4 px-2 py-1 bg-zinc-900 text-[10px] font-bold text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
        TOOLTIP
      </div>
    </button>
  );
}
