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
       vec2f(3,-1),
       vec2f(-1,3),
       vec2f(-1,-1),
     );

     return VSOut(vec4f(points[index], 0, 1), points[index]);
  }

  
  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  @group(0) @binding(1) var image: texture_3d<f32>;
  @group(0) @binding(2) var image_sampler: sampler;
  
  @fragment
  fn fs(@location(0) pos: vec2f) -> @location(0) vec4f {

    let texcoord = (vec3f(pos.x, pos.y, .5) + 1) / 2;
 
    return uniforms.red * textureSample(image, image_sampler, texcoord);
  }
  `;
