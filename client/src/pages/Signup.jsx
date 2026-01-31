import { useState } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";
import React from "react";


export default function Signup() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const nav = useNavigate();

  const submit = async () => {
    if (p !== c) return alert("Passwords mismatch");
    await api.post("/auth/signup", { username: u, password: p });
    nav("/");
  };

  return (
    <div className="center">
      <h2>Signup</h2>
      <input placeholder="Username" onChange={e => setU(e.target.value)} />
      <input type="password" placeholder="Password" onChange={e => setP(e.target.value)} />
      <input type="password" placeholder="Confirm" onChange={e => setC(e.target.value)} />
      <button onClick={submit}>Signup</button>
    </div>
  );
}
