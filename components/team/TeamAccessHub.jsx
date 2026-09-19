"use client";

import { useState } from "react";
import { TeamManagementView } from "./TeamManagementView";
import RolesPermissionsV2 from "./RolesPermissionsV2";

export default function TeamAccessHub(props) {
  const [tab,setTab]=useState("team");
  return <div>
    <div className="gov-tabs">
      <button className={tab==="team"?"active":""} onClick={()=>setTab("team")}>Team & Invites</button>
      <button className={tab==="permissions"?"active":""} onClick={()=>setTab("permissions")}>Roles & Permissions</button>
    </div>
    {tab==="team"
      ? <TeamManagementView {...props}/>
      : <RolesPermissionsV2 {...props}/>}
  </div>;
}
