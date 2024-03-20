export const shader = /* wgsl */ `

  struct Uniforms {
    red: f32
  }

  struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) pos: vec2f
  } 

  @vertex
  fn vertex_shader (@builtin(vertex_index) index: u32) -> VSOut {
  
     let points = array(
       vec2f(1,-1),
       vec2f(-1,1),
       vec2f(-1,-1),
     );

     return VSOut(vec4f(points[index], 0, 1), points[index]);
  }

  
  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  
  @fragment
  fn fs(@location(0) pos: vec2f) -> @location(0) vec4f {
    return vec4f(uniforms.red,0,0,1);
  }
  `;
